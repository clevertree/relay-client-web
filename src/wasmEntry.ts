// Re-export shim for wasm-bindgen outputs so bundlers (Vite) can statically analyze imports.
// This file should live inside client-web/src so import('/src/wasmEntry') is valid.

// Default helper: call default exports if available to initialize both modules.
export async function initAllClientWasms(): Promise<void> {
  // hook-transpiler (using wasm-pack --target web output)
  try {
    // Import the wasm-pack generated module
    // @ts-ignore
    const hookMod = await import('./wasm/relay_hook_transpiler.js')

    // The default export is an async init function that accepts WASM input
    // Prefer bundler ?url (Vite), but fallback to plain file URL (esbuild loader=file)
    let hookWasmUrl: string
    try {
      // @ts-ignore
      const hookWasmUrlMod = await import('./wasm/relay_hook_transpiler_bg.wasm?url')
      hookWasmUrl = String(hookWasmUrlMod && (hookWasmUrlMod as any).default ? (hookWasmUrlMod as any).default : hookWasmUrlMod)
    } catch (_) {
      try {
        // @ts-ignore
        const fallbackMod = await import('./wasm/relay_hook_transpiler_bg.wasm')
        hookWasmUrl = String((fallbackMod as any).default || fallbackMod)
      } catch (e2) {
        // Last resort: resolve relative to module URL
        hookWasmUrl = new URL('./wasm/relay_hook_transpiler_bg.wasm', import.meta.url).href
      }
    }
    // Normalize to an absolute URL relative to this module so hashed assets resolve under /assets/
    hookWasmUrl = new URL(hookWasmUrl, import.meta.url).href
    console.log('[wasmEntry] Loading WASM from:', hookWasmUrl)

    if (hookMod && typeof hookMod.default === 'function') {
      await hookMod.default(hookWasmUrl)
      console.log('[wasmEntry] Hook transpiler initialized')
    }

    // Set up global hooks
    if (typeof hookMod.transpile_jsx === 'function') {
      globalThis.__hook_transpile_jsx = hookMod.transpile_jsx
      const version = (typeof hookMod.get_version === 'function') ? hookMod.get_version() : 'unknown'
      globalThis.__hook_transpiler_version = version
      console.log('[wasmEntry] hook-transpiler loaded, version:', version)
    }
  } catch (e) {
    console.warn('[wasmEntry] hook init failed', e)
  }

  // themed-styler
  try {
    // Import the wrapper (for API exposure) and resolve wasm URL via bundler or fallback
    // @ts-ignore
    const stylerMod = await import('./wasm/themed_styler.js')
    if (stylerMod) {
      let stylerWasmUrl: string | undefined
      try {
        // Prefer bundler-resolved asset URL
        // @ts-ignore
        const mod = await import('./wasm/themed_styler_bg.wasm?url')
        stylerWasmUrl = String(mod && (mod as any).default ? (mod as any).default : mod)
      } catch (e) {
        // bundler import failed; try plain file URL or manifest
        try {
          // @ts-ignore
          const plain = await import('./wasm/themed_styler_bg.wasm')
          stylerWasmUrl = String((plain as any).default || plain)
        } catch (_) {
          // fall back to manifest (if present in src/wasm)
        }
        try {
          // @ts-ignore - import the manifest as JSON via bundler
          const m = await import('./wasm/themed_styler.manifest.json')
          if (m && m.default && m.default.wasm_path) {
            const ts = m.default.generated_at ? encodeURIComponent(m.default.generated_at) : Date.now()
            stylerWasmUrl = `${m.default.wasm_path}?t=${ts}`
            if (m.default.version && typeof m.default.version === 'string') {
              (globalThis as any).__themedStyler_version = m.default.version
            }
          }
        } catch (e) {
          // ignore
        }
      }
      // Initialize the wasm by calling the wrapper's default init with the resolved URL
      if (stylerWasmUrl) {
        stylerWasmUrl = new URL(stylerWasmUrl, import.meta.url).href
      }
      if (typeof (stylerMod as any).default === 'function') {
        try {
          if (stylerWasmUrl) await (stylerMod as any).default(stylerWasmUrl)
          else await (stylerMod as any).default()
        } catch (e) { /* ignore init failures */ }
      }
      const renderCss = (stylerMod as any).render_css_for_web as ((s: string) => string) | undefined
      const getRn = (stylerMod as any).get_rn_styles as ((state_json: string, selector: string, classes_json: string) => string) | undefined
      const getThemeListJson = (stylerMod as any).get_theme_list_json as ((state_json: string) => string) | undefined
      // Expose themed-styler version if available
      if (typeof (stylerMod as any).get_version === 'function') {
        try { (globalThis as any).__themedStyler_version = (stylerMod as any).get_version() } catch (e) { (globalThis as any).__themedStyler_version = 'unknown' }
      } else {
        (globalThis as any).__themedStyler_version = (globalThis as any).__themedStyler_version || 'unknown'
      }

      if (typeof renderCss === 'function') {
        ; (globalThis as any).__themedStylerRenderCss = (usageSnapshot: any, themes: any) => {
          try {
            const themeMap = themes?.themes || {}
            const currentTheme = themes?.currentTheme
            const defaultTheme = currentTheme || Object.keys(themeMap)[0] || 'default'
            // Structured usage: tags, classes, tag+class pairs
            const state = JSON.stringify({
              themes: themeMap,
              current_theme: currentTheme || defaultTheme,
              default_theme: defaultTheme,
              used_tags: usageSnapshot?.tags || [],
              used_classes: usageSnapshot?.classes || [],
              used_tag_classes: usageSnapshot?.tagClasses || [],
            })
            return String(renderCss(state))
          } catch (e) {
            return ''
          }
        }
      }

      if (typeof getRn === 'function') {
        ; (globalThis as any).__themedStylerGetRn = (selector: string, classes: string[], themesState?: any) => {
          try {
            const classesJson = JSON.stringify(classes || [])
            const themeMap = (themesState && themesState.themes) || {}
            const currentTheme = themesState?.currentTheme || null
            const defaultTheme = currentTheme || Object.keys(themeMap)[0] || 'default'
            const stateJson = JSON.stringify({
              themes: themeMap,
              current_theme: currentTheme || defaultTheme,
              default_theme: defaultTheme,
            })
            return JSON.parse(String(getRn(stateJson, selector, classesJson)))
          } catch (e) {
            return {}
          }
        }
      }

      if (typeof getThemeListJson === 'function') {
        ; (globalThis as any).__themedStylerGetThemeList = () => {
          try {
            const themesSnapshot = (globalThis as any).__bridgeGetThemes ? (globalThis as any).__bridgeGetThemes() : { themes: {}, currentTheme: null }
            const themeMap = themesSnapshot?.themes || {}
            const currentTheme = themesSnapshot?.currentTheme || null
            const defaultTheme = currentTheme || Object.keys(themeMap)[0] || 'default'
            const stateJson = JSON.stringify({
              themes: themeMap,
              current_theme: currentTheme || defaultTheme,
              default_theme: defaultTheme,
            })
            return String(getThemeListJson(stateJson))
          } catch (e) {
            return '[]'
          }
        }
      }
    }
  } catch (e) {
    console.warn('[wasmEntry] themed-styler init failed', e)
  }
}

export default { initAllClientWasms }

// DEV helper: force initialize the themed-styler by fetching the public manifest and
// calling the wasm-bindgen background init directly with the manifest URL. This bypasses
// bundler-resolved auto-init and is useful for debugging stale/cached wasm binaries.
export async function forceInitThemedStylerFromManifest(): Promise<string | null> {
  try {
    const resp = await fetch('/wasm/themed_styler.manifest.json', { cache: 'no-cache' })
    if (!resp.ok) return null
    const m = await resp.json()
    if (!m || !m.wasm_path) return null
    const ts = m.generated_at ? encodeURIComponent(m.generated_at) : Date.now()
    const stylerWasmUrl = `${m.wasm_path}?t=${ts}`
    // Import the bg glue directly and call its default init with the URL so it
    // fetches the public wasm file instead of using the bundler-resolved module.
    // @ts-ignore
    const bg = await import('./wasm/themed_styler_bg.js')
    if (bg && typeof (bg as any).default === 'function') {
      try {
        await (bg as any).default(stylerWasmUrl)
      } catch (e) {
        // init may throw if already initialized; ignore
      }
    }
    // Re-import the wrapper so we can expose the same APIs and read version
    // @ts-ignore
    const styler = await import('./wasm/themed_styler.js')
    if (styler && typeof (styler as any).get_version === 'function') {
      try {
        const v = (styler as any).get_version()
          ; (globalThis as any).__themedStyler_version = v
        return v
      } catch (e) {
        // fall-through
      }
    }
    // fallback: manifest may include version
    if (m.version && typeof m.version === 'string') {
      ; (globalThis as any).__themedStyler_version = m.version
      return m.version
    }
    return null
  } catch (e) {
    return null
  }
}
