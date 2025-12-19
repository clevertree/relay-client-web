import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HookLoader, WebModuleLoader, transpileCode, type HookContext, unifiedBridge, styleManager } from '@relay/shared'
import ErrorBoundary from './ErrorBoundary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FileRenderer } from './FileRenderer'
import { TSDiv } from './TSDiv'

type HookRendererProps = { host: string; hookPath?: string }

function normalizeHostUrl(host: string) {
    if (!host) return ''
    if (host.startsWith('http://') || host.startsWith('https://')) return host
    if (host.includes(':')) return `http://${host}`
    return `https://${host}`
}

// Lightweight client-side usage registry. This collects used selectors/classes at runtime.
// Later we can wire this to the themed-styler state via an IPC/CLI call or network endpoint.
function registerUsageFromElement(tag: string, props?: Record<string, unknown>) {
    try {
        // delegate to the shared runtime bridge which centralizes usage
        unifiedBridge.registerUsage(tag, props as Record<string, unknown>)
        // request a render from the style manager (debounced internally)
        try { styleManager.requestRender() } catch (e) {
            console.debug('Style manager render failed:', e)
        }
    } catch (e) {
        console.debug('Usage registration failed:', e)
    }
}

function createHookReact(reactModule: typeof React) {
    const baseCreate = reactModule.createElement.bind(reactModule)
    function hookCreateElement(type: string | React.ComponentType, props: Record<string, unknown> | null, ...children: React.ReactNode[]) {
        if (typeof type === 'string') {
            try {
                registerUsageFromElement(type, props || undefined)
            } catch (e) {
                console.debug('Element registration failed:', e)
            }
        }
        return baseCreate(type, props, ...children)
    }
    return { ...reactModule, createElement: hookCreateElement }
}

const HookRenderer: React.FC<HookRendererProps> = ({ host, hookPath }) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [element, setElement] = useState<React.ReactNode | null>(null)
    const normalizedHost = useMemo(() => normalizeHostUrl(host), [host])
    const loaderRef = useRef<HookLoader | null>(null)

    useEffect(() => {
        if (!host) return
        const protocol = normalizedHost.startsWith('https://') ? 'https' : 'http'
        const hostOnly = normalizedHost.replace(/^https?:\/\//, '')

        // No requireShim needed for web loader; WebModuleLoader executes code in a sandboxed Function

        const rewriteBuiltins = (code: string) => {
            // Replace bare @relay/* imports with globals to avoid browser bare-spec failures
            const mkBuiltin = (spec: string, destructure: string) => `const ${destructure} = ((globalThis && globalThis.__relay_builtins && globalThis.__relay_builtins['${spec}']) || {});`
            const markdownRe = /import\s+\{\s*MarkdownRenderer\s*\}\s+from\s+['"]@relay\/markdown['"];?/g
            const themeRe = /import\s+\{\s*registerThemesFromYaml\s*\}\s+from\s+['"]@relay\/theme['"];?/g
            const jsxRuntimeRe = /import\s+\{\s*jsx\s+as\s+(_jsx)\s*,\s*jsxs\s+as\s+(_jsxs)\s*,\s*Fragment\s+as\s+(_Fragment)\s*\}\s+from\s+['"]react\/jsx-runtime['"];?/g
            let rewritten = code.replace(markdownRe, mkBuiltin('@relay/markdown', '{ MarkdownRenderer }'))
            rewritten = rewritten.replace(themeRe, mkBuiltin('@relay/theme', '{ registerThemesFromYaml }'))
            rewritten = rewritten.replace(jsxRuntimeRe, (_m, a, b, c) => `const ${a} = (globalThis.__hook_jsx_runtime?.jsx || globalThis.__jsx || (globalThis.__hook_react && globalThis.__hook_react.createElement) || (() => null)); const ${b} = (globalThis.__hook_jsx_runtime?.jsxs || globalThis.__jsxs || (globalThis.__hook_react && globalThis.__hook_react.createElement) || (() => null)); const ${c} = (globalThis.__hook_jsx_runtime?.Fragment || globalThis.__Fragment || (globalThis.__hook_react && globalThis.__hook_react.Fragment));`)
            return rewritten
        }

        const transpiler = async (code: string, filename: string) => {
            const out = await transpileCode(code, { filename })
            return rewriteBuiltins(out)
        }

        const webLoader = new WebModuleLoader()
        loaderRef.current = new HookLoader({ host: hostOnly, protocol: protocol as 'http' | 'https', moduleLoader: webLoader, transpiler: transpiler })

        // Start style auto-sync while this renderer is mounted
        try {
            styleManager.startAutoSync()
            styleManager.requestRender()
        } catch (e) {
            console.debug('Failed to start style auto-sync:', e)
        }
        return () => {
            try { styleManager.stopAutoSync() } catch (e) {
                console.debug('Failed to stop style auto-sync:', e)
            }
        }
    }, [normalizedHost, host])

    const createHookContext = useCallback((baseHookPath: string): HookContext => {
        const buildPeer = (p: string) => `${normalizedHost}${p.startsWith('/') ? p : '/' + p}`

        const resolveThemeUrl = (path: string) => {
            if (path.startsWith('/')) {
                return `${normalizedHost}${path}`
            }
            const base = (window as any).__currentModulePath || baseHookPath || '/'
            const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
            return new URL(path, `${normalizedHost}${baseDir}/`).href
        }

        const FileRendererAdapter = ({ path }: { path: string }) => {
            const [content, setContent] = useState<string>('')
            const [contentType, setContentType] = useState<string>('text/plain')
            const [loading, setLoading] = useState(true)
            useEffect(() => {
                let cancelled = false
                    ; (async () => {
                        try {
                            const url = `${normalizedHost}${path.startsWith('/') ? path : '/' + path}`
                            const resp = await fetch(url)
                            const txt = await resp.text()
                            if (!cancelled) {
                                setContent(txt)
                                setContentType(resp.headers.get('content-type') || 'text/plain')
                            }
                        } catch (e) {
                            if (!cancelled) setContent('')
                        } finally {
                            if (!cancelled) setLoading(false)
                        }
                    })()
                return () => { cancelled = true }
            }, [path])

            if (loading) return <TSDiv>Loading file...</TSDiv>
            return <FileRenderer content={content} contentType={contentType} />
        }

        const registerThemesFromYaml = async (path: string) => {
            try {
                const absolute = resolveThemeUrl(path)
                await (unifiedBridge as any).loadThemesFromYamlUrl(absolute)
                try { styleManager.renderCssIntoDom() } catch { /* ignore */ }
            } catch (e) {
                console.warn('[HookRenderer] registerThemesFromYaml failed:', e)
            }
        }

        const builtinModules: Record<string, any> = {
            '@relay/markdown': { MarkdownRenderer },
            '@relay/theme': {
                registerThemeStyles: (name: string, defs?: Record<string, any>) => {
                    unifiedBridge.registerTheme(name, defs)
                    try { styleManager.renderCssIntoDom() } catch (e) { }
                },
                registerThemesFromYaml,
            },
        }

            // Expose built-ins globally so transpiled hooks can resolve bare imports safely
            ; (window as any).__relay_builtins = builtinModules

        const loadModule = async (modulePath: string, fromPathArg?: string) => {
            if (builtinModules[modulePath]) return builtinModules[modulePath]
            if (!loaderRef.current) throw new Error('loader not ready')
            // Prefer the current module path tracked by the loader if available,
            // otherwise fall back to the base hook path.
            const fromPath = fromPathArg || (window as any).__currentModulePath || baseHookPath
            return loaderRef.current.loadModule(modulePath, fromPath, createHookContext(fromPath))
        }

        return {
            React: createHookReact(React),
            createElement: createHookReact(React).createElement,
            FileRenderer: FileRendererAdapter,
            Layout: undefined,
            helpers: {
                buildPeerUrl: buildPeer,
                loadModule,
                registerThemeStyles: (name: string, defs?: Record<string, any>) => {
                    unifiedBridge.registerTheme(name, defs)
                    // After registering a theme, re-render CSS into the DOM
                    try { styleManager.renderCssIntoDom() } catch (e) { }
                },
                registerThemesFromYaml,
            }
        }
    }, [normalizedHost])

    const tryRender = useCallback(async () => {
        setLoading(true)
        setError(null)
        setElement(null)
        try {
            const path = hookPath || '/hooks/client/get-client.jsx'
            if (!loaderRef.current) throw new Error('hook loader not initialized')
            const ctx = createHookContext(path)
            const el = await loaderRef.current.loadAndExecuteHook(path, ctx)
            setElement(el)
            // After rendering the hook, ensure CSS for currently-registered usage is applied
            try { styleManager.renderCssIntoDom() } catch (e) { }
        } catch (e: any) {
            console.error('[HookRenderer] Error loading/executing hook:', e)
            const message = e?.message || String(e)
            const stack = e?.stack || ''
            const fullError = stack ? `${message}\n\nStack Trace:\n${stack}` : message
            setError(fullError)
        } finally {
            setLoading(false)
        }
    }, [createHookContext, hookPath])

    useEffect(() => { void tryRender() }, [tryRender])

    return (
        <TSDiv style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {loading && <TSDiv>Loading hook...</TSDiv>}
            {error && <TSDiv style={{ color: 'red' }}><TSDiv tag="strong">Error:</TSDiv> {error}</TSDiv>}
            {!loading && !error && element && (
                <ErrorBoundary>
                    <TSDiv style={{ flex: 1 }}>{element}</TSDiv>
                </ErrorBoundary>
            )}
        </TSDiv>
    )
}

export default HookRenderer
