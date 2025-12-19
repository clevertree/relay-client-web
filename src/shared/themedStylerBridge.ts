/**
 * In-memory bridge for themed-styler usage.
 * Collected at runtime by web and RN HookRenderers via shared imports.
 */

import { parse as parseYAML } from 'yaml'

type Props = Record<string, any>
type HierNode = { tag: string; classes?: string[] }

const usage = {
  tags: new Set<string>(),
  classes: new Set<string>(),
  tagClasses: new Set<string>(), // encoded as `${tag}|${class}`
}

const themes: Record<string, Record<string, any>> = {}
let currentTheme: string | null = null

export function registerUsage(tag: string, props?: Props, hierarchy?: HierNode[]) {
  const cls = props ? ((props.className || props.class || '') as string) : ''
  const classes = typeof cls === 'string' && cls.trim().length
    ? cls.split(/\s+/).map((c) => c.trim()).filter(Boolean)
    : []

  if (tag) usage.tags.add(tag)
  for (const c of classes) {
    usage.classes.add(c)
    if (tag) usage.tagClasses.add(`${tag}|${c}`)
  }

  // hierarchy parameter is kept for API compatibility but not used for selector generation
}

export function clearUsage() {
  usage.tags.clear()
  usage.classes.clear()
  usage.tagClasses.clear()
}

export function getUsageSnapshot() {
  return {
    tags: Array.from(usage.tags.values()),
    classes: Array.from(usage.classes.values()),
    tagClasses: Array.from(usage.tagClasses.values()),
  }
}

export function registerTheme(name: string, defs?: Record<string, unknown>) {
  themes[name] = defs || {}
  if (!currentTheme) currentTheme = name
  // Expose current themes state globally for wasmEntry's theme list function
  if (typeof globalThis !== 'undefined') {
    ; (globalThis as any).__bridgeGetThemes = () => getThemes()
  }
}

export function setCurrentTheme(name: string) {
  currentTheme = name
  // Expose current themes state globally for wasmEntry's theme list function
  if (typeof globalThis !== 'undefined') {
    ; (globalThis as any).__bridgeGetThemes = () => getThemes()
  }
  // Trigger immediate CSS re-render in web by notifying styleManager lazily
  try {
    // Dynamic import avoids ESM circular dependency at module load
    // and is a no-op on RN where styleManager DOM APIs are not present.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    import('./styleManager').then((m) => {
      try { (m as any).requestRender && (m as any).requestRender() } catch { /* noop */ }
    }).catch(() => { /* ignore */ })
  } catch { /* ignore */ }
}

export function getThemes() { return { themes: { ...themes }, currentTheme } }

export function getThemeList(): Array<{ key: string; name: string }> {
  // If WASM is available, try to get theme list from it
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
  if (typeof g.__themedStylerGetThemeList === 'function') {
    try {
      const themeListJson = g.__themedStylerGetThemeList()
      return JSON.parse(themeListJson || '[]')
    } catch (e) {
      console.warn('[themedStylerBridge] Failed to get theme list from WASM:', e)
    }
  }

  // Fallback: use in-memory themes registry
  return Object.keys(themes).map((key) => ({
    key,
    name: (themes[key] as any)?.name || key,
  }))
}

// Attempt to populate themes from theme.yaml file.
let _defaults_loaded = false

async function wasmInitIfAvailable() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  try {
    // @ts-ignore - web-only dynamic import
    const shim = await import('/src/wasm/themed_styler.js')
    if (!shim) return null
    if (typeof (shim as Record<string, unknown>).default === 'function') {
      try { await ((shim as Record<string, unknown>).default as () => Promise<void>)() } catch { /* already initialized */ }
    }
    return shim as Record<string, any>
  } catch {
    return null
  }
}

export async function loadThemesFromYamlText(yamlText: string): Promise<void> {
  try {
    const themeConfig = parseYAML(yamlText) as Record<string, any>
    if (!themeConfig || !themeConfig.themes) {
      console.warn('[themedStylerBridge] No themes found in provided YAML')
      return
    }

    const shim = await wasmInitIfAvailable()

    if (shim && typeof shim.get_default_state_json === 'function' && typeof shim.register_theme_json === 'function') {
      // Start from current in-memory themes to avoid wiping previously-registered themes
      const buildInitialState = () => {
        try {
          const existing = getThemes()
          const payload = {
            themes: existing.themes || {},
            default_theme: existing.currentTheme || Object.keys(existing.themes || {})[0] || '',
            current_theme: existing.currentTheme || Object.keys(existing.themes || {})[0] || '',
            variables: {},
            breakpoints: {},
            used_selectors: [],
            used_classes: [],
            used_tags: [],
            used_tag_classes: [],
          }
          return JSON.stringify(payload)
        } catch {
          return String(shim.get_default_state_json())
        }
      }

      let currentState = buildInitialState()
      for (const [themeName, themeData] of Object.entries(themeConfig.themes || {})) {
        try {
          const payload = JSON.stringify({ name: themeName, theme: themeData })
          currentState = String(shim.register_theme_json(currentState, payload))
        } catch (e) {
          console.warn(`[themedStylerBridge] Failed to register theme via WASM: ${themeName}`, e)
        }
      }
      if (typeof shim.set_theme_json === 'function') {
        const desired = themeConfig.default_theme || (getThemes().currentTheme || '')
        if (desired) {
          try { currentState = String(shim.set_theme_json(currentState, desired)) } catch { /* ignore */ }
        }
      }
      try {
        const parsed = JSON.parse(currentState || '{}')
        if (parsed && parsed.themes) {
          // Merge themes without clearing others; override same-name keys
          for (const [k, v] of Object.entries(parsed.themes)) registerTheme(k, v as Record<string, unknown>)
          if (parsed.current_theme) setCurrentTheme(parsed.current_theme as string)
        }
      } catch { /* ignore parse failure */ }
      return
    }

    // Fallback: no WASM; register directly from YAML object (merge by name)
    for (const [themeName, themeData] of Object.entries(themeConfig.themes || {})) {
      registerTheme(themeName, themeData as Record<string, unknown>)
    }
    if (themeConfig.default_theme) setCurrentTheme(String(themeConfig.default_theme))
  } catch (e) {
    console.error('[themedStylerBridge] loadThemesFromYamlText failed:', e)
  }
}

export async function loadThemesFromYamlUrl(url: string): Promise<void> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn('[themedStylerBridge] Failed to fetch YAML from URL:', url, resp.status)
      return
    }
    const yamlText = await resp.text()
    await loadThemesFromYamlText(yamlText)
  } catch (e) {
    console.error('[themedStylerBridge] loadThemesFromYamlUrl failed:', e)
  }
}

export async function ensureDefaultsLoaded(): Promise<void> {
  if (_defaults_loaded) return
  _defaults_loaded = true
  console.log('[themedStylerBridge] Loading themes from YAML...')
  try {
    // Prefer bundler-resolved import (esbuild loader maps .yaml to text)
    try {
      // @ts-ignore
      const mod = await import('./theme.yaml')
      const yamlText = String((mod as any)?.default ?? mod)
      if (yamlText && yamlText.length) {
        await loadThemesFromYamlText(yamlText)
        return
      }
    } catch (e) {
      // fall through to fetch
    }
    const url = new URL('./theme.yaml', import.meta.url).href
    await loadThemesFromYamlUrl(url)
  } catch (e) {
    console.error('[themedStylerBridge] ensureDefaultsLoaded failed:', e)
  }
}

// Placeholder: in future this should call into the themed-styler binary or runtime
export function getCssForWeb(): string {
  // If platform provides a hook, call it
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
  if (typeof g.__themedStylerRenderCss === 'function') {
    try { return g.__themedStylerRenderCss(getUsageSnapshot(), getThemes()) } catch (e) { }
  }
  // If running under Node, attempt to call the hook-transpiler CLI to compute CSS
  if ((globalThis as any) && (globalThis as any).process && (globalThis as any).process.versions && (globalThis as any).process.versions.node) {
    try {
      // Use temp file for state JSON
      const _req: any = (globalThis as any).require ? (globalThis as any).require : (eval('require') as any)
      const fs = _req('fs')
      const os = _req('os')
      const cp = _req('child_process')
      const path = _req('path')
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'themed-styler-'))
      const statePath = path.join(tmp, 'state.json')
      const snap = getUsageSnapshot()
      fs.writeFileSync(statePath, JSON.stringify({ themes: getThemes().themes, default_theme: getThemes().currentTheme, current_theme: getThemes().currentTheme, variables: {}, breakpoints: {}, used_tags: snap.tags, used_classes: snap.classes, used_tag_classes: snap.tagClasses }, null, 2))
      // Run cargo run -p hook-transpiler -- style css --file <statePath>
      const repoRoot = path.resolve(((globalThis as any).process && (globalThis as any).process.cwd && (globalThis as any).process.cwd()) || '.')
      const out = cp.execFileSync('cargo', ['run', '--silent', '-p', 'hook-transpiler', '--', 'style', 'css', '--file', statePath], { cwd: repoRoot, encoding: 'utf8' })
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) { }
      return String(out || '')
    } catch (e) {
      // swallow and fallback to placeholder
    }
  }

  const snap = getUsageSnapshot()
  return `/* themed-styler fallback (no renderer):\nclasses=${JSON.stringify(snap.classes)}\ntags=${JSON.stringify(snap.tags)}\ntagClasses=${JSON.stringify(snap.tagClasses)}\n*/`
}

// RN accessor: placeholder returns empty style object. Later will query real runtime state.
export function getRnStyles(selector: string, classes: string[] = []) {
  // Attempt to call a provided hook if present
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {}
  if (typeof g.__themedStylerGetRn === 'function') {
    const themesState = getThemes()
    try { return g.__themedStylerGetRn(selector, classes, themesState) } catch (e) { }
  }
  return {}
}

export default {
  registerUsage,
  clearUsage,
  getUsageSnapshot,
  registerTheme,
  setCurrentTheme,
  getThemes,
  getThemeList,
  getCssForWeb,
  getRnStyles,
  loadThemesFromYamlText,
  loadThemesFromYamlUrl,
}
