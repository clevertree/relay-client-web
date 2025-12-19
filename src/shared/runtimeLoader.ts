/**
 * Unified Runtime Loader for Relay Hooks
 *
 * Provides a shared interface for loading and transpiling TS/TSX/JSX hooks
 * across both web and React Native clients. Abstracts away platform-specific
 * module execution (browser import vs RN eval).
 */

import { ES6ImportHandler, type ImportHandlerOptions } from './es6ImportHandler'

// Provide type definitions for global scope (for React and process availability)
declare const global: any
declare const process: any/**
 * Babel transform configuration for hook modules
 */
export interface TransformOptions {
  filename: string
  hasJsxPragma?: boolean
  development?: boolean
}

/**
 * Result of transpiling code to CommonJS (used in RN)
 */
export interface TransformResult {
  code: string
  sourceMaps?: string
}

/**
 * Context passed to executed hooks
 */
export type ComponentType<P = any> = (props: P) => any

export interface HookContext {
  React: any
  createElement: any
  FileRenderer: ComponentType<{ path: string }>
  Layout?: ComponentType<any>
  params: Record<string, any>
  helpers: HookHelpers
}

/**
 * Helper functions available to hooks
 */
export interface HookHelpers {
  navigate?: never // ❌ Removed: Repos manage their own routing via React state
  buildPeerUrl: (path: string) => string
  loadModule: (modulePath: string, fromPath?: string) => Promise<any>
  setBranch?: (branch: string) => void
  buildRepoHeaders?: (branch?: string, repo?: string) => Record<string, string>
  registerThemeStyles?: (themeName: string, definitions?: Record<string, unknown>) => void
  registerThemesFromYaml?: (path: string) => Promise<void>
}

/**
 * Diagnostics and error information
 */
export interface LoaderDiagnostics {
  phase: 'init' | 'options' | 'fetch' | 'transform' | 'import' | 'exec'
  kind?: 'get' | 'query' | 'put'
  error?: string
  details?: Record<string, any>
  [key: string]: any
}

/**
 * Module loader adapter for platform-specific execution
 */
export interface ModuleLoader {
  /**
   * Load and execute a module, returning its exports
   * @param code The module source code
   * @param filename Path to the module for source maps
   * @param context The hook context to make available to the module
   * @param fetchUrl Optional: The actual URL where the module was fetched from (for @relay/meta)
   * @returns Resolved module exports
   */
  executeModule(code: string, filename: string, context: HookContext, fetchUrl?: string): Promise<any>
}

/**
 * Web-specific module loader: uses Function constructor for Metro compatibility
 */
export class WebModuleLoader implements ModuleLoader {
  async executeModule(code: string, filename: string, context: HookContext, fetchUrl?: string): Promise<any> {
    // Note: preamble is now added BEFORE transpilation in transpileCode(),
    // so we no longer need to add it again here

    const exports: any = {}
    const module = { exports }

    try {
      // Set global context for JSX transpiled code
      ; (window as any).__ctx__ = context
        // Provide a stable global import-with shim that never changes across modules
        ; (window as any).__hook_import_with = async (spec: string, fromFile: string) => {
          try {
            const dbg = (globalThis as any).__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
            if (dbg) {
              try { console.debug('[__hook_import_with] spec=', spec, 'fromFile=', fromFile) } catch { }
            }
            const fn = (context && context.helpers && typeof context.helpers.loadModule === 'function') ? context.helpers.loadModule : null
            if (!fn) throw new Error('__hook_import_with unavailable: helpers.loadModule not available')
            return await fn(spec, fromFile)
          } catch (e) {
            console.error('[WebModuleLoader] __hook_import_with failed for', spec, 'from', fromFile, e)
            throw e
          }
        }

      // Build a per-module alias that binds the caller filename. This ensures any
      // rewritten calls to __hook_import(spec) inside this module resolve relative
      // to this file, regardless of other modules being loaded later.
      const perModuleAlias = `const __hook_import = (spec) => (globalThis.__hook_import_with ? globalThis.__hook_import_with(String(spec), ${JSON.stringify(filename)}) : Promise.reject(new Error('__hook_import_with not available')));\n`

      // If the transpiled code contains ESM export syntax, evaluate it as an ES module
      // by creating a blob and dynamic-importing it. This allows transpilers that emit
      // `export`/`export default` to run in the browser while keeping the Function
      // execution path for legacy CommonJS-style code (metro compatibility).
      const looksLikeESM = /\bexport\b/.test(code)
      if (looksLikeESM) {
        try {
          // Transpiler has already rewritten special imports (react, @relay/*, etc.) to use globals
          // Store module metadata in globalThis for @relay/meta import (ES6 compliant)
          const dirname = filename.substring(0, filename.lastIndexOf('/') || 0)
          // Use fetchUrl if provided (actual fetch location), otherwise construct from filename
          const url = fetchUrl || `${(globalThis as any).location?.origin || 'http://localhost'}${filename}`
            ; (globalThis as any).__relay_meta = { filename, dirname, url }
          // Just inject the per-module alias and execute
          const blob = new Blob([perModuleAlias, code], { type: 'text/javascript' })
          const blobUrl = URL.createObjectURL(blob)
            // Ensure globals are available for module execution
            ; (window as any).__hook_react = context.React
          // Provide JSX runtime globals for transpiled output
          // Create a proper jsx() wrapper that handles the automatic JSX runtime signature
          // jsx(type, config, maybeKey) - the third parameter is the key, not a child
          const createJsxFactory = (React: any) => {
            if (!React) return undefined
            // Debug flag: enable verbose logging of jsx/jsxs calls when
            // globalThis.__HOOK_DEBUG is truthy or localStorage hookDebug === '1'
            const shouldLogJsx = (() => {
              try {
                const g: any = (globalThis as any)
                return !!g.__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
              } catch {
                return false
              }
            })()
            const elementType = (() => {
              try {
                if (React && typeof React.createElement === 'function') {
                  const el = React.createElement('div', null)
                  if (el && el.$$typeof) return el.$$typeof
                }
              } catch { }
              return Symbol.for('react.element')
            })()
            const logJsx = (kind: string, type: any, key: any, props: any) => {
              if (!shouldLogJsx) return
              try {
                const typeName = typeof type === 'string' ? type : (type && (type.displayName || type.name)) || 'anonymous'
                const children = props ? props.children : undefined
                const childType = Array.isArray(children) ? 'array' : (children === null ? 'null' : typeof children)
                const childSummary = Array.isArray(children)
                  ? `[${children.length} items]`
                  : (children && typeof children === 'object')
                    ? (children && children['$$typeof'] ? 'react.element' : 'object')
                    : children
                const keys = props ? Object.keys(props) : []
                // Avoid logging huge arrays of children — keep it concise
                console.debug(`[jsx/${kind}]`, { type: typeName, key, childType, childSummary, propsKeys: keys })
              } catch {
                // ignore log failures
              }
            }
            return (type: any, config: any, maybeKey: any) => {
              let key = null
              let ref = null
              let props: any = {}

              if (maybeKey !== undefined) {
                key = String(maybeKey)
              }

              // Filter out key and ref from props, keep everything else (including children)
              if (config) {
                for (let propName in config) {
                  if (propName === 'key') {
                    key = String(config.key)
                  } else if (propName === 'ref') {
                    ref = config.ref
                  } else {
                    props[propName] = config[propName]
                  }
                }
              }

              logJsx('prod', type, key, props)
              return {
                '$$typeof': elementType,
                type,
                key,
                ref: ref || null,
                props
              }
            }
          }
          const jsxFactory = createJsxFactory(context.React)
          const fragmentFactory = (context.React && (context.React.Fragment || (context.React as any).Fragment)) ? (context.React.Fragment || (context.React as any).Fragment) : undefined
            ; (window as any).__hook_jsx_runtime = { jsx: jsxFactory, jsxs: jsxFactory, Fragment: fragmentFactory }
            ; (window as any).__jsx = jsxFactory
            ; (window as any).__jsxs = jsxFactory
            ; (window as any).__Fragment = fragmentFactory
            ; (window as any).__hook_file_renderer = (context && context.FileRenderer) || null
            ; (window as any).__hook_helpers = (context && context.helpers) || {}
          console.log('[WebModuleLoader] Set globals before blob import:', {
            hasReact: !!(window as any).__hook_react,
            hasJsxRuntime: !!(window as any).__hook_jsx_runtime,
            hasFileRenderer: !!(window as any).__hook_file_renderer,
            hasHelpers: !!(window as any).__hook_helpers,
            filename,
            fetchUrl
          })
          // Small delay to ensure globals are set before blob execution
          await new Promise(resolve => setTimeout(resolve, 0))
            // Ensure context is available to module (transpiler may read window.__ctx__)
            // Dynamic import will evaluate as a proper ES module.
            // Use an indirect dynamic import constructed via Function so Metro
            // transformer does not parse a static `import(...)` call during
            // transform. Wrapping the import in a string avoids Metro's syntax
            // checking while still performing a proper dynamic import at runtime.
            // Track current module path for nested lazy loads
            ; (window as any).__currentModulePath = filename
          const dynImport = new Function('u', 'return import(u)')
          const ns = await dynImport(blobUrl)
          // Clean up blob URL
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
          // If module has default export, normalize to CommonJS-like shape
          const normalized = ns && ns.default ? { ...ns, default: ns.default } : ns
          // Return module-like object
          return normalized
        } catch (e) {
          console.error('[WebModuleLoader] Dynamic import of ES module failed', e)
          throw e
        }
      }

      // Use Function constructor instead of dynamic import for Metro compatibility
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'require',
        'module',
        'exports',
        'context',
        `
try {
  ${perModuleAlias}
  ${code}
} catch (err) {
  console.error('[WebModuleLoader] Code execution error in ${filename}:', err.message || err);
  throw err;
}
        `
      )

        // Execute the module code
        // Track current module path for nested lazy loads
        ; (window as any).__currentModulePath = filename
      fn(
        (spec: string) => {
          // Require shim: intercept special module names to return context values
          if (spec === 'react') {
            return context.React || {}
          }
          if (spec === '@relay/helpers') {
            return context.helpers || {}
          }
          if (spec === '@relay/file-renderer') {
            return context.FileRenderer || (() => null)
          }
          if (spec === '@relay/layout') {
            return context.Layout || null
          }
          if (spec === '@relay/markdown') {
            return (context as any).__relay_builtins?.['@relay/markdown'] || (globalThis as any).__relay_builtins?.['@relay/markdown'] || {}
          }
          if (spec === '@relay/theme') {
            return (context as any).__relay_builtins?.['@relay/theme'] || (globalThis as any).__relay_builtins?.['@relay/theme'] || {}
          }
          if (spec === '@relay/meta') {
            return (globalThis as any).__relay_meta || { filename: '', dirname: '', url: '' }
          }
          if (spec === 'react/jsx-runtime') {
            const r: any = context.React || (globalThis as any).__hook_react || (globalThis as any).React || {}
            const shouldLogJsx = (() => {
              try {
                const g: any = (globalThis as any)
                return !!g.__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
              } catch {
                return false
              }
            })()
            const logJsx = (kind: string, type: any, key: any, props: any) => {
              if (!shouldLogJsx) return
              try {
                const typeName = typeof type === 'string' ? type : (type && (type.displayName || type.name)) || 'anonymous'
                const children = props ? props.children : undefined
                const childType = Array.isArray(children) ? 'array' : (children === null ? 'null' : typeof children)
                const childSummary = Array.isArray(children)
                  ? `[${children.length} items]`
                  : (children && typeof children === 'object')
                    ? (children && children['$$typeof'] ? 'react.element' : 'object')
                    : children
                const keys = props ? Object.keys(props) : []
                console.debug(`[jsx/${kind}]`, { type: typeName, key, childType, childSummary, propsKeys: keys })
              } catch {
                // ignore log failures
              }
            }
            const jsxFactory = (type: any, config: any, maybeKey: any) => {
              let key = null
              let ref = null
              let props: any = {}
              const elementType = (() => {
                try {
                  if (r && typeof (r as any).createElement === 'function') {
                    const el = (r as any).createElement('div', null)
                    if (el && (el as any).$$typeof) return (el as any).$$typeof
                  }
                } catch { }
                return Symbol.for('react.element')
              })()

              if (maybeKey !== undefined) {
                key = String(maybeKey)
              }

              // Filter out key and ref from props, keep everything else (including children)
              if (config) {
                for (let propName in config) {
                  if (propName === 'key') {
                    key = String(config.key)
                  } else if (propName === 'ref') {
                    ref = config.ref
                  } else {
                    props[propName] = config[propName]
                  }
                }
              }

              logJsx('shim', type, key, props)
              return {
                '$$typeof': elementType,
                type,
                key,
                ref: ref || null,
                props
              }
            }
            return {
              jsx: jsxFactory,
              jsxs: jsxFactory,
              Fragment: r.Fragment,
            }
          }
          // Fallback for other requires
          return {}
        },
        module,
        exports,
        context
      )

      // Ensure JSX runtime globals exist for modules executed via Function path
      const createJsxFactory2 = (React: any) => {
        if (!React) return undefined
        const shouldLogJsx = (() => {
          try {
            const g: any = (globalThis as any)
            return !!g.__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
          } catch {
            return false
          }
        })()
        const logJsx = (kind: string, type: any, key: any, props: any) => {
          if (!shouldLogJsx) return
          try {
            const typeName = typeof type === 'string' ? type : (type && (type.displayName || type.name)) || 'anonymous'
            const children = props ? props.children : undefined
            const childType = Array.isArray(children) ? 'array' : (children === null ? 'null' : typeof children)
            const childSummary = Array.isArray(children)
              ? `[${children.length} items]`
              : (children && typeof children === 'object')
                ? (children && children['$$typeof'] ? 'react.element' : 'object')
                : children
            const keys = props ? Object.keys(props) : []
            console.debug(`[jsx/func]`, { type: typeName, key, childType, childSummary, propsKeys: keys })
          } catch {
            // ignore log failures
          }
        }
        const elementType = (() => {
          try {
            if (React && typeof React.createElement === 'function') {
              const el = React.createElement('div', null)
              if (el && el.$$typeof) return el.$$typeof
            }
          } catch { }
          return Symbol.for('react.element')
        })()
        return (type: any, config: any, maybeKey: any) => {
          let key = null
          let ref = null
          let props: any = {}

          if (maybeKey !== undefined) {
            key = String(maybeKey)
          }

          // Filter out key and ref from props, keep everything else (including children)
          if (config) {
            for (let propName in config) {
              if (propName === 'key') {
                key = String(config.key)
              } else if (propName === 'ref') {
                ref = config.ref
              } else {
                props[propName] = config[propName]
              }
            }
          }

          logJsx('func', type, key, props)
          return {
            '$$typeof': elementType,
            type,
            key,
            ref: ref || null,
            props
          }
        }
      }
      const jsxFactory2 = createJsxFactory2(context.React)
      const fragmentFactory = context.React?.Fragment
      if (!(globalThis as any).__hook_jsx_runtime) {
        ; (globalThis as any).__hook_jsx_runtime = { jsx: jsxFactory2, jsxs: jsxFactory2, Fragment: fragmentFactory }
      }
      if (!(globalThis as any).__jsx && jsxFactory2) {
        ; (globalThis as any).__jsx = jsxFactory2
          ; (globalThis as any).__jsxs = jsxFactory2
      }
      if (!(globalThis as any).__Fragment && fragmentFactory) {
        ; (globalThis as any).__Fragment = fragmentFactory
      }

      // Return the module exports
      const mod = module.exports
      if (!mod || typeof mod.default !== 'function') {
        throw new Error('Hook module does not export a default function')
      }

      return mod
    } finally {
      // Clean up global after async operations may complete
      setTimeout(() => {
        delete (window as any).__ctx__
        try { delete (window as any).__hook_import } catch { }
        delete (window as any).__currentModulePath
      }, 500)
    }
  }
}

/**
 * React Native module loader: uses Function constructor with ES6 import() support
 * 
 * Executes hook code with support for ES6 dynamic imports via __import__() calls.
 * This allows hooks to use modern import() syntax instead of CommonJS require().
 */
export class RNModuleLoader implements ModuleLoader {
  private importHandler: ES6ImportHandler | null = null
  private requireShim: (spec: string) => any
  private transpiler: (code: string, filename: string) => Promise<string>

  constructor(options?: {
    requireShim?: (spec: string) => any
    host?: string
    transpiler?: (code: string, filename: string) => Promise<string>
    onDiagnostics?: (diag: any) => void
  }) {
    this.requireShim = options?.requireShim || ((spec: string) => {
      // Provide basic React shim for RN
      if (spec === 'react') {
        // For RN, React is already in the global scope
        return typeof (global as any).React !== 'undefined' ? (global as any).React : {}
      }
      return {}
    })

    this.transpiler = options?.transpiler || (async (code: string) => code)

    // Initialize ES6 import handler if host is provided
    if (options?.host) {
      this.importHandler = new ES6ImportHandler({
        host: options.host,
        baseUrl: '/hooks',
        onDiagnostics: options?.onDiagnostics,
        transpiler: this.transpiler,
      })
    }
  }

  /**
   * Set up the import handler (called after host is known)
   */
  setImportHandler(importHandler: ES6ImportHandler): void {
    this.importHandler = importHandler
  }

  async executeModule(code: string, filename: string, context: HookContext, fetchUrl?: string): Promise<any> {
    const exports: any = {}
    const module = { exports }

    // Check if code uses ES6 import() syntax
    const usesES6Import = /\bawait\s+import\s*\(|import\s*\(/.test(code)

    if (usesES6Import && !this.importHandler) {
      console.warn(
        '[RNModuleLoader] Code uses import() but no ES6ImportHandler available. Install will fail.',
        { filename }
      )
    }

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      '__import__',
      'require',
      'module',
      'exports',
      'context',
      `
try {
  ${code}
} catch (err) {
  console.error('[RNModuleLoader] Code execution error in ${filename}:', err.message || err);
  throw err;
}
//# sourceURL=${filename}
    `
    )

    try {
      // Provide current execution context and filename to import handler so it can
      // resolve relative paths and optionally delegate to helpers.loadModule
      if (this.importHandler) {
        try {
          // @ts-ignore - methods exist on ES6ImportHandler
          this.importHandler.setCurrentModulePath?.(filename)
          // @ts-ignore
          this.importHandler.setExecutionContext?.(context)
        } catch (e) {
          console.warn('[RNModuleLoader] Failed to set import handler context:', e)
        }
      }
      // Pass ES6 import handler as first parameter (or dummy if not available)
      let importFn = this.importHandler?.handle.bind(this.importHandler)
      if (!importFn) {
        importFn = (modulePath: string) => {
          throw new Error(`import('${modulePath}') not supported - ES6ImportHandler not initialized`)
        }
      }

      // Expose global import shim for transpiled code
      ; (globalThis as any).__currentModulePath = filename
        ; (globalThis as any).__hook_import = importFn

      await fn(importFn, this.requireShim, module, exports, context)

      // Cleanup globals after execution
      setTimeout(() => {
        try { delete (globalThis as any).__hook_import } catch { }
        try { delete (globalThis as any).__currentModulePath } catch { }
      }, 500)

      // Ensure module.exports and exports are in sync
      // If code modified exports, make sure it's reflected in module.exports
      // If code modified module.exports, make sure it overwrites exports
      if (module.exports !== exports) {
        // Code modified module.exports - use that
        // module.exports already has the right value
      } else {
        // Code modified exports but not module.exports - sync them
        module.exports = exports
      }
    } catch (err) {
      console.error(`[RNModuleLoader] Failed to execute module ${filename}:`, err)
      throw err
    }

    const mod = (module as any).exports || exports

    // Debug logging
    console.log('[RNModuleLoader] After execution - mod object:', JSON.stringify(mod, null, 2))
    console.log('[RNModuleLoader] mod.default type:', typeof (mod?.default))
    console.log('[RNModuleLoader] module.exports === exports?', (module as any).exports === exports)
    console.log('[RNModuleLoader] exports object:', JSON.stringify(exports, null, 2))

    if (!mod || typeof mod.default !== 'function') {
      throw new Error('Hook module must export default function(ctx)')
    }

    return mod
  }
}

/**
 * Transpile TypeScript/JSX to JavaScript (using @babel/standalone)
 *
 * @param code Source code to transpile
 * @param options Transform configuration
 * @param toCommonJs If true, also transform ESM imports/exports to CommonJS (for RN)
 * @returns Transpiled code
 */
export async function transpileCode(
  code: string,
  options: TransformOptions,
  _toCommonJs: boolean = false
): Promise<string> {
  // STRICT MODE: Disable SWC/Babel/server fallbacks.
  // Only use the new Rust crate WASM binding if available on the page.
  // The web app must load the crate and expose globalThis.__hook_transpile_jsx(source, filename) => string

  const filename = options.filename || 'module.tsx'
  const g: any = (typeof globalThis !== 'undefined' ? (globalThis as any) : {})
  const wasmTranspile: any = g.__hook_transpile_jsx
  const version = g.__hook_transpiler_version || 'unknown'
  const forceServer: boolean = !!g.__forceServerTranspile

  // If Settings forces server-side transpiler, bypass WASM and call server
  if (forceServer) {
    try {
      const resp = await fetch('/api/transpile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, filename, to_common_js: false }),
      } as any)
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        throw new Error(`ServerTranspileError: ${resp.status} ${resp.statusText} ${txt}`)
      }
      const data: any = await resp.json()
      if (!data?.ok || !data?.code) {
        throw new Error(`ServerTranspileError: ${data?.diagnostics || 'unknown error'}`)
      }
      const out = String(data.code)
      const rewritten = out.replace(/\bimport\s*\(/g, 'context.helpers.loadModule(')
      return rewritten + `\n//# sourceURL=${filename}`
    } catch (e) {
      throw e
    }
  }

  if (typeof wasmTranspile !== 'function') {
    const availableKeys = Object.keys(g).filter(k => k.startsWith('__')).join(', ')
    console.error('[transpileCode] WASM not ready:', {
      hasGlobalThis: typeof globalThis !== 'undefined',
      hasHook: '__hook_transpile_jsx' in g,
      type: typeof wasmTranspile,
      globalKeys: availableKeys || '(none)'
    })
    // Optional server fallback when enabled via Settings
    if ((g as any).__allowServerTranspile) {
      console.warn('[transpileCode] WASM not ready; attempting server fallback /api/transpile')
      try {
        const resp = await fetch('/api/transpile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, filename, to_common_js: false }),
        } as any)
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '')
          throw new Error(`ServerTranspileError: ${resp.status} ${resp.statusText} ${txt}`)
        }
        const data: any = await resp.json()
        if (!data?.ok || !data?.code) {
          throw new Error(`ServerTranspileError: ${data?.diagnostics || 'unknown error'}`)
        }
        const out = String(data.code)
        const rewritten = out.replace(/\bimport\s*\(/g, 'context.helpers.loadModule(')
        return rewritten + `\n//# sourceURL=${filename}`
      } catch (e) {
        console.error('[transpileCode] Server fallback failed:', e)
      }
    }
    throw new Error(`HookTranspiler WASM not loaded (v${version}): expected globalThis.__hook_transpile_jsx(source, filename)`)
  }

  // Extract JSX pragma (default to h / React.Fragment)
  let pragmaFn = 'h'
  let pragmaFragFn = 'React.Fragment'
  const pragmaMatch = code.match(/\/\*+\s*@jsx\s+([\w.]+)\s*\*+\//)
  const pragmaFragMatch = code.match(/\/\*+\s*@jsxFrag\s+([\w.]+)\s*\*+\//)
  if (pragmaMatch && pragmaMatch[1]) pragmaFn = pragmaMatch[1]
  if (pragmaFragMatch && pragmaFragMatch[1]) pragmaFragFn = pragmaFragMatch[1]
  const preamble = ``
  const codeWithPreamble = preamble + code

  // DEBUG: Check if function is actually callable
  let out: any;
  try {
    out = await wasmTranspile(codeWithPreamble, filename)
  } catch (callError) {
    console.error('[transpileCode] WASM call threw exception:', callError)
    // Optional server fallback when enabled
    if ((g as any).__allowServerTranspile) {
      console.warn('[transpileCode] Attempting server fallback due to WASM exception')
      try {
        const resp = await fetch('/api/transpile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, filename, to_common_js: false }),
        } as any)
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '')
          throw new Error(`ServerTranspileError: ${resp.status} ${resp.statusText} ${txt}`)
        }
        const data: any = await resp.json()
        if (!data?.ok || !data?.code) {
          throw new Error(`ServerTranspileError: ${data?.diagnostics || 'unknown error'}`)
        }
        const out = String(data.code)
        const rewritten = out.replace(/\bimport\s*\(/g, 'context.helpers.loadModule(')
        return rewritten + `\n//# sourceURL=${filename}`
      } catch (e) {
        console.error('[transpileCode] Server fallback failed after WASM exception:', e)
      }
    }
    throw callError
  }

  // Handle WASM result object: { code: string | null, map: string | null, error: string | null }
  let transpiledCode: string;
  if (typeof out === 'object' && out !== null) {
    if (out.error) {
      // WASM returned an error
      const errorMsg = `TranspileError: ${filename}: ${out.error} (v${version})`
      console.error('[transpileCode] JSX transpilation failed:', {
        filename,
        inputSize: code.length,
        errorMessage: errorMsg,
        codePreview: code.substring(0, 200)
      })
        // Make transpiled code available for debugging
        ; (globalThis as any).__lastTranspiledCode = null
        ; (globalThis as any).__lastTranspileError = errorMsg

      // Optional server fallback for user-enabled path
      if ((g as any).__allowServerTranspile) {
        console.warn('[transpileCode] WASM returned error; attempting server fallback')
        try {
          const resp = await fetch('/api/transpile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, filename, to_common_js: false }),
          } as any)
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '')
            throw new Error(`ServerTranspileError: ${resp.status} ${resp.statusText} ${txt}`)
          }
          const data: any = await resp.json()
          if (!data?.ok || !data?.code) {
            throw new Error(`ServerTranspileError: ${data?.diagnostics || 'unknown error'}`)
          }
          transpiledCode = String(data.code)
          const rewritten = transpiledCode.replace(/\bimport\s*\(/g, 'context.helpers.loadModule(')
          return rewritten + `\n//# sourceURL=${filename}`
        } catch (e) {
          console.error('[transpileCode] Server fallback failed after WASM error:', e)
        }
      }
      throw new Error(errorMsg)
    }

    if (!out.code) {
      throw new Error(`HookTranspiler returned empty code for ${filename}`)
    }

    transpiledCode = out.code
  } else if (typeof out === 'string') {
    // Legacy string return (shouldn't happen with current WASM, but handle it)
    transpiledCode = out
  } else {
    throw new Error(`HookTranspiler returned unexpected type: ${typeof out}`)
  }

  // Store for debugging if needed
  if (transpiledCode.startsWith('TranspileError:')) {
    const errorMsg = `${transpiledCode} (v${version})`
    console.error('[transpileCode] JSX transpilation failed:', {
      filename,
      inputSize: code.length,
      errorMessage: errorMsg,
      codePreview: code.substring(0, 200)
    })
      // Make transpiled code available for debugging
      ; (globalThis as any).__lastTranspiledCode = transpiledCode
      ; (globalThis as any).__lastTranspileError = errorMsg
    // Optional server fallback for user-enabled path
    if ((g as any).__allowServerTranspile) {
      console.warn('[transpileCode] WASM returned TranspileError; attempting server fallback')
      try {
        const resp = await fetch('/api/transpile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, filename, to_common_js: false }),
        } as any)
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '')
          throw new Error(`ServerTranspileError: ${resp.status} ${resp.statusText} ${txt}`)
        }
        const data: any = await resp.json()
        if (!data?.ok || !data?.code) {
          throw new Error(`ServerTranspileError: ${data?.diagnostics || 'unknown error'}`)
        }
        transpiledCode = String(data.code)
        const rewritten = transpiledCode.replace(/\bimport\s*\(/g, 'context.helpers.loadModule(')
        return rewritten + `\n//# sourceURL=${filename}`
      } catch (e) {
        console.error('[transpileCode] Server fallback failed after TranspileError:', e)
      }
    }
    throw new Error(errorMsg)
  }

  // Store transpiled code for debugging
  ; (globalThis as any).__lastTranspiledCode = transpiledCode

  // Check if output still has JSX syntax (< followed by uppercase letter)
  const stillHasJsx = /<[A-Z]/.test(transpiledCode);
  if (stillHasJsx) {
    console.warn('[transpileCode] WARNING: Output still contains JSX syntax! Transpilation may have failed silently.');
    console.warn('[transpileCode] Transpiled code available at: window.__lastTranspiledCode');
  } else if (transpiledCode.includes('React.createElement(')) {
    console.log('[transpileCode] ✓ Output contains React.createElement() calls - transpilation successful')
  }

  // Rust transpiler already handles dynamic import() rewriting to __hook_import()
  // No need for JS post-processing
  return transpiledCode + `\n//# sourceURL=${filename}`
}

/**
 * Detect if code looks like TypeScript/JSX/TSX
 */
export function looksLikeTsOrJsx(code: string, filename: string): boolean {
  const hasPragma = /@use-jsx|@use-ts|@jsx\s+h/m.test(code)
  const hasJsxSyntax = /<([A-Za-z][A-Za-z0-9]*)\s/.test(code)
  const isTypescriptExt = filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.jsx')
  return hasPragma || hasJsxSyntax || isTypescriptExt
}

/**
 * Hook loader orchestrator: handles full lifecycle of loading and executing hooks
 */
export interface HookLoaderOptions {
  host: string
  protocol: 'http' | 'https'
  moduleLoader: ModuleLoader
  transpiler?: (code: string, filename: string) => Promise<string>
  onDiagnostics?: (diag: LoaderDiagnostics) => void
}

export class HookLoader {
  private host: string
  private protocol: 'http' | 'https'
  private moduleLoader: ModuleLoader
  private transpiler?: (code: string, filename: string) => Promise<string>
  private onDiagnostics: (diag: LoaderDiagnostics) => void
  private moduleCache: Map<string, any> = new Map()
  private logTranspileResult(filename: string, code: string): void {
    const containsExport = /\bexport\b/.test(code)
    const sample = code.substring(0, 200).replace(/\n/g, '\\n')
    const logger = containsExport ? console.warn : console.debug
    logger(
      `[HookLoader] Transpiler output for ${filename} (contains export=${containsExport}, len=${code.length})`,
      sample
    )
  }

  constructor(options: HookLoaderOptions) {
    this.host = options.host
    this.protocol = options.protocol
    this.moduleLoader = options.moduleLoader
    this.transpiler = options.transpiler
    this.onDiagnostics = options.onDiagnostics || (() => { })
  }

  private buildRequestHeaders(context: HookContext): Record<string, string> {
    const builder = context?.helpers?.buildRepoHeaders
    if (!builder) return {}
    return { ...builder() }
  }

  /**
   * Load a module from the peer/repo, with optional transpilation
   * @param modulePath Relative or absolute path to module
   * @param fromPath Current hook path for resolving relative imports
   * @param context Hook context for module execution
   * @returns Module exports
   */
  async loadModule(
    modulePath: string,
    fromPath: string = '/hooks/client/get-client.jsx',
    context: HookContext
  ): Promise<any> {
    // Resolve path robustly relative to the current hook file path
    let normalizedPath = modulePath
    try {
      const dbg = (globalThis as any).__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
      if (dbg) {
        try { console.debug('[HookLoader.loadModule] start', { modulePath, fromPath }) } catch { }
      }
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        // Ensure the base includes the 'client' segment by default
        const base = fromPath && fromPath.startsWith('/') ? fromPath : '/hooks/client/get-client.jsx'
        const baseUrl = new URL(base, 'http://resolver.local')
        const resolved = new URL(modulePath, baseUrl)
        normalizedPath = resolved.pathname
      } else if (!modulePath.startsWith('/')) {
        normalizedPath = `/hooks/client/${modulePath}`
      }
      // Normalize path by resolving .. and . segments
      const parts = normalizedPath.split('/').filter(Boolean)
      const normalized: string[] = []
      for (const part of parts) {
        if (part === '..') {
          normalized.pop()
        } else if (part !== '.') {
          normalized.push(part)
        }
      }
      normalizedPath = '/' + normalized.join('/')
      if (dbg) {
        try { console.debug('[HookLoader.loadModule] normalized', { modulePath, fromPath, normalizedPath }) } catch { }
      }
    } catch (_) {
      // Fallback to previous logic if URL API not available for some reason
      const baseDir = (fromPath || '/hooks/client/get-client.jsx').split('/').slice(0, -1).join('/') || '/hooks/client'
      const combined = `${baseDir}/${modulePath}`
      // Normalize by resolving .. and . segments
      const parts = combined.split('/').filter(Boolean)
      const normalized: string[] = []
      for (const part of parts) {
        if (part === '..') {
          normalized.pop()
        } else if (part !== '.') {
          normalized.push(part)
        }
      }
      normalizedPath = '/' + normalized.join('/')
      try {
        const dbg2 = (globalThis as any).__HOOK_DEBUG || (typeof localStorage !== 'undefined' && localStorage.getItem('hookDebug') === '1')
        if (dbg2) console.debug('[HookLoader.loadModule] normalized (fallback)', { modulePath, fromPath, normalizedPath })
      } catch { }
    }

    // Check cache
    const cacheKey = `${this.host}:${normalizedPath}`
    if (this.moduleCache.has(cacheKey)) {
      return this.moduleCache.get(cacheKey)
    }

    const moduleUrl = `${this.protocol}://${this.host}${normalizedPath}`
    const requestHeaders = this.buildRequestHeaders(context)
    const fetchOptions = Object.keys(requestHeaders).length ? { headers: requestHeaders } : undefined

    try {
      const response = await fetch(moduleUrl, fetchOptions)
      if (!response.ok) {
        throw new Error(`ModuleLoadError: ${moduleUrl} → ${response.status} ${response.statusText}`)
      }
      const ct = (response.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('text/html')) {
        // Server likely returned an HTML error page; don't try to execute it
        throw new Error(`ModuleLoadError: ${moduleUrl} returned HTML (content-type=${ct})`)
      }

      const code = await response.text()

      // Transpile if needed (RN always routes through custom transpiler)
      let finalCode = code
      const shouldTranspile = !!this.transpiler || looksLikeTsOrJsx(code, normalizedPath)
      if (shouldTranspile) {
        try {
          if (this.transpiler) {
            finalCode = await this.transpiler(code, normalizedPath)
            this.logTranspileResult(normalizedPath, finalCode)
          } else {
            finalCode = await transpileCode(
              code,
              { filename: normalizedPath },
              false // Web uses import, not CommonJS
            )
          }
        } catch (err) {
          const msg = (err as any)?.message || String(err)
          const diag: LoaderDiagnostics = {
            phase: 'transform',
            error: msg,
            details: { moduleUrl, filename: normalizedPath, ...(err as any) }
          }
          this.onDiagnostics(diag)
          throw new Error(`TranspileError: ${normalizedPath}: ${msg}`)
        }
      }

      // Execute and cache
      let mod: any
      try {
        mod = await this.moduleLoader.executeModule(finalCode, normalizedPath, context, moduleUrl)
      } catch (execErr) {
        const execMsg = (execErr as any)?.message || String(execErr)
        const syntaxMatch = execMsg.match(/Unexpected token|missing \)|SyntaxError/)
        const diag: LoaderDiagnostics = {
          phase: 'import',
          error: execMsg,
          details: {
            filename: normalizedPath,
            isSyntaxError: !!syntaxMatch,
            transpilerVersion: (globalThis as any).__hook_transpiler_version || 'unknown'
          }
        }
        console.error('[RuntimeLoader] Module execution failed:', {
          filename: normalizedPath,
          error: execMsg,
          isSyntaxError: !!syntaxMatch,
          transpilerVersion: (globalThis as any).__hook_transpiler_version
        })
        this.onDiagnostics(diag)
        throw execErr
      }
      this.moduleCache.set(cacheKey, mod)
      return mod
    } catch (err) {
      console.error('[HookLoader.loadModule] Failed:', modulePath, err)
      throw err
    }
  }

  /**
   * Load and execute a hook module
   * @param hookPath Path to the hook module (from OPTIONS)
   * @param context The hook context to pass
   * @returns Executed hook element/result
   */
  async loadAndExecuteHook(hookPath: string, context: HookContext): Promise<any> {
    const diag: LoaderDiagnostics = { phase: 'init' }

    try {
      diag.phase = 'fetch'
      const hookUrl = `${this.protocol}://${this.host}${hookPath}`
      console.debug(`[HookLoader] Fetching hook from: ${hookUrl}`)
      const requestHeaders = this.buildRequestHeaders(context)
      const fetchOptions = Object.keys(requestHeaders).length ? { headers: requestHeaders } : undefined

      let response: Response
      let code: string

      try {
        // Try fetch with a timeout using XMLHttpRequest as fallback
        response = await fetch(hookUrl, fetchOptions)
        code = await response.text()
      } catch (fetchErr) {
        console.error('[HookLoader] Fetch failed, got error immediately:', fetchErr)
        throw fetchErr
      }

      console.debug(`[HookLoader] Received hook code (${code.length} chars)`)

      diag.fetch = {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
      }

      if (!response.ok) {
        throw new Error(`ModuleLoadError: ${hookUrl} → ${response.status} ${response.statusText}`)
      }
      const ct = (response.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('text/html')) {
        throw new Error(`ModuleLoadError: ${hookUrl} returned HTML (content-type=${ct})`)
      }

      diag.codeLength = code.length

      // Transpile if needed
      diag.phase = 'transform'
      let finalCode = code
      const shouldTranspile = !!this.transpiler || looksLikeTsOrJsx(code, hookPath)
      if (shouldTranspile) {
        try {
          console.debug(`[HookLoader] Transpiling ${hookPath}`)

          // Use custom transpiler if provided (e.g., for React Native with CommonJS conversion)
          if (this.transpiler) {
            finalCode = await this.transpiler(code, hookPath)
            this.logTranspileResult(hookPath, finalCode)
          } else {
            finalCode = await transpileCode(
              code,
              { filename: hookPath, hasJsxPragma: /@jsx\s+h/m.test(code) },
              false // Web uses dynamic import
            )
          }
          console.debug(`[HookLoader] Transpilation complete (${finalCode.length} chars)`)
        } catch (err) {
          const msg = (err as any)?.message || String(err)
          console.warn('[HookLoader] JSX transpilation failed', { hookPath, error: msg })
          diag.transpileWarn = msg
          diag.details = { ...(diag.details || {}), filename: hookPath }
          diag.error = msg
          this.onDiagnostics(diag)
          throw new Error(`TranspileError: ${hookPath}: ${msg}`)
        }
      }

      // Execute
      diag.phase = 'import'
      console.debug(`[HookLoader] Executing hook module`)

      try {
        // Pass the actual fetch URL for @relay/meta injection, not the logical path
        const mod = await this.moduleLoader.executeModule(finalCode, hookPath, context, hookUrl)

        if (!mod || typeof mod.default !== 'function') {
          throw new Error('Hook module does not export a default function')
        }

        diag.phase = 'exec'
        console.debug(`[HookLoader] Calling hook function`)
        const element = await mod.default(context)
        console.debug(`[HookLoader] Hook executed successfully`)

        return element
      } catch (execErr) {
        console.error('[HookLoader] Hook execution error:', execErr)
        throw execErr
      }
    } catch (err) {
      diag.error = err instanceof Error ? err.message : String(err)
      diag.stack = err instanceof Error ? err.stack : undefined
      console.error('[HookLoader] Error during loadAndExecuteHook:', diag)
      this.onDiagnostics(diag)
      throw err
    }
  }

  /**
   * Clear module cache (useful for hot reload or cleanup)
   */
  clearCache(): void {
    this.moduleCache.clear()
  }
}
