import { useCallback, useEffect, useMemo, useState } from 'react'
import { styleManager, unifiedBridge } from '@clevertree/themed-styler'
import { useTranspilerSetting } from '../state/transpilerSettings'
import type { ThemeName } from '../state/store'
import { useAppState } from '../state/store'
import { TSDiv } from './TSDiv'

interface JsonBlockProps {
    value: unknown
}

function JsonBlock({ value }: JsonBlockProps) {
    const text = useMemo(() => {
        try {
            return JSON.stringify(value, null, 2)
        } catch (e) {
            return String(value)
        }
    }, [value])
    return <TSDiv tag="pre">{text}</TSDiv>
}

interface WasmError {
    message: string
    stack?: string
    time: string
}

interface UsageSnapshot {
    selectors: string[]
    classes: string[]
}

interface Themes {
    themes: Record<string, unknown>
    currentTheme?: string
}

interface ThemeListItem {
    key: string
    name: string
}

interface DebugPanelState {
    css: string
    usage: UsageSnapshot | { error: string } | null
    themesState: Themes | { error: string } | null
    themedStylerFullState: Record<string, unknown> | { error: string } | null
    wasmError: WasmError | null
}

export function SettingsTab() {
    const { setting, setSetting } = useTranspilerSetting()
    const theme = useAppState((s) => s.theme)
    const setTheme = useAppState((s) => s.setTheme)
    const [themeList, setThemeList] = useState<ThemeListItem[]>([])

    // Load theme list on mount
    useEffect(() => {
        try {
            const list = unifiedBridge.getThemeList()
            setThemeList(list)
        } catch (e) {
            console.error('Failed to get theme list:', e)
        }
    }, [])

    // Compute description based on two modes only
    const selectedDescription = useMemo(() => {
        if (setting === 'server-only')
            return 'Always use the server /api/transpile endpoint for hooks. Useful for environments where WASM is unavailable.'
        return 'Use the WASM hook transpiler that ships with the web app. Syntax errors are reported directly from the client.'
    }, [setting])

    // classes inspector
    const [search, setSearch] = useState('')
    const [classes, setClasses] = useState<string[]>([])
    const [stylerStatus, setStylerStatus] = useState({
        styleTag: false,
        selectors: 0,
        classes: 0,
        cssPreview: '',
    })

    // Themed Styler Debug state
    const [debugPanel, setDebugPanel] = useState<DebugPanelState>({
        css: '',
        usage: null,
        themesState: null,
        themedStylerFullState: null,
        wasmError: null,
    })

    const collectActiveClasses = () => {
        const set = new Set<string>()
        try {
            const all = document.body.querySelectorAll('*')
            all.forEach((el) => {
                const cls = (el as HTMLElement).className || ''
                if (typeof cls === 'string' && cls.length) {
                    cls
                        .split(/\s+/)
                        .map((c) => c.trim())
                        .filter(Boolean)
                        .forEach((c) => set.add(c))
                }
            })
        } catch {
        }
        return Array.from(set).sort()
    }

    const refreshClasses = () => setClasses(collectActiveClasses())
    const refreshStylerStatus = useCallback(() => {
        try {
            const snapshot = unifiedBridge.getUsageSnapshot() as UsageSnapshot
            const tag = document.querySelector('style[data-themed-styler]')
            let preview = tag?.textContent?.trim() || ''
            if (preview.length > 300) {
                preview = `${preview.slice(0, 300)}...`
            }
            setStylerStatus({
                styleTag: !!tag,
                selectors: snapshot.selectors.length,
                classes: snapshot.classes.length,
                cssPreview: preview,
            })
        } catch (e) {
            setStylerStatus((prev) => ({ ...prev, cssPreview: `Error: ${e instanceof Error ? e.message : String(e)}` }))
        }
    }, [])

    // Themed Styler Debug - refresh function
    const refreshDebugPanel = useCallback(() => {
        setDebugPanel((prev) => {
            try {
                const newState = { ...prev }

                try {
                    newState.css = unifiedBridge.getCssForWeb()
                } catch (e) {
                    newState.css = String(e)
                }

                try {
                    newState.usage = unifiedBridge.getUsageSnapshot() as UsageSnapshot
                } catch (e) {
                    newState.usage = { error: String(e) }
                }

                try {
                    const themes = unifiedBridge.getThemes && typeof unifiedBridge.getThemes === 'function'
                        ? (unifiedBridge.getThemes() as Themes)
                        : null
                    newState.themesState = themes

                    if (themes) {
                        try {
                            const usageSnapshot = unifiedBridge.getUsageSnapshot
                                ? (unifiedBridge.getUsageSnapshot() as UsageSnapshot)
                                : { selectors: [], classes: [] }
                            const themesMap = themes.themes || {}
                            const current = themes.currentTheme ?? null
                            const defaultTheme = current || Object.keys(themesMap)[0] || null

                            newState.themedStylerFullState = {
                                themes: themesMap,
                                default_theme: defaultTheme,
                                current_theme: current,
                                variables: {},
                                breakpoints: {},
                                used_selectors: usageSnapshot.selectors || [],
                                used_classes: usageSnapshot.classes || [],
                            }
                        } catch (e) {
                            newState.themedStylerFullState = { error: String(e) }
                        }
                    }
                } catch (e) {
                    newState.themesState = { error: String(e) }
                }

                return newState
            } catch (e) {
                console.error('[SettingsTab] refreshDebugPanel error:', e)
                return prev
            }
        })
    }, [])

    const copyCss = useCallback(() => {
        navigator.clipboard?.writeText(debugPanel.css)
    }, [debugPanel.css])

    const forceLoadFromManifest = useCallback(async () => {
        return null
    }, [])

    useEffect(() => {
        ; (async () => {
            try {
                const { initThemedStyler } = await import('@clevertree/themed-styler')
                await initThemedStyler()
                refreshDebugPanel()
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e)
                const errorStack = e instanceof Error ? e.stack : undefined
                setDebugPanel((prev) => ({
                    ...prev,
                    wasmError: {
                        message: errorMessage,
                        stack: errorStack,
                        time: new Date().toISOString(),
                    },
                }))
            }
        })()
        // subscribe to styleManager change events for immediate updates
        const unsub = styleManager.onChange ? styleManager.onChange(refreshDebugPanel) : () => {
        }
        return () => {
            try {
                unsub()
            } catch (e) {
                console.debug('cleanup error:', e)
            }
        }
    }, [refreshDebugPanel])

    useEffect(() => {
        refreshClasses()
        // Optional: observe DOM changes to keep list updated
        const obs = new MutationObserver(() => {
            // lightweight throttle by requestAnimationFrame
            requestAnimationFrame(() => refreshClasses())
        })
        obs.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] })
        return () => obs.disconnect()
    }, [])

    useEffect(() => {
        refreshStylerStatus()
        const unsub = styleManager.onChange ? styleManager.onChange(refreshStylerStatus) : () => {
        }
        return () => unsub()
    }, [refreshStylerStatus])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return classes
        return classes.filter((c) => c.toLowerCase().includes(q))
    }, [classes, search])

    const isServer = setting === 'server-only'

    return (
        <TSDiv className="flex-1 overflow-y-auto p-6 space-y-6">
            <TSDiv>
                <TSDiv tag="h1" className="text-2xl font-semibold">Relay settings</TSDiv>
                <TSDiv tag="p" className="text-sm mt-1">Control how hooks are transpiled.</TSDiv>
            </TSDiv>

            <TSDiv tag="section">
                <TSDiv className="flex items-center justify-between">
                    <TSDiv>
                        <TSDiv tag="h2" className="text-lg font-semibold">Theme</TSDiv>
                        <TSDiv tag="p" className="text-sm">Choose your preferred color theme.</TSDiv>
                    </TSDiv>
                </TSDiv>

                <TSDiv className="flex items-center justify-between rounded-lg border p-4">
                    <TSDiv>
                        <TSDiv tag="p" className="text-base font-medium">Appearance</TSDiv>
                        <TSDiv tag="p" className="text-sm mt-1">Select a theme for the application interface</TSDiv>
                    </TSDiv>
                    <TSDiv tag="label" className="inline-flex items-center cursor-pointer select-none">
                        <select
                            value={theme}
                            onChange={(e) => setTheme(e.target.value as ThemeName)}
                            className="px-3 py-2 border rounded-md bg-surface text-text cursor-pointer"
                        >
                            {themeList.length > 0 ? (
                                themeList.map((t) => (
                                    <option key={t.key} value={t.key}>
                                        {t.name}
                                    </option>
                                ))
                            ) : (
                                <>
                                    <option value="default">Default (Light)</option>
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                </>
                            )}
                        </select>
                    </TSDiv>
                </TSDiv>
            </TSDiv>

            <TSDiv tag="section">
                <TSDiv className="flex items-center justify-between">
                    <TSDiv>
                        <TSDiv tag="h2" className="text-lg font-semibold">Transpiler</TSDiv>
                        <TSDiv tag="p" className="text-sm">Choose between client-side (WASM) and server-side
                            transpilation.</TSDiv>
                    </TSDiv>
                </TSDiv>

                <TSDiv className="flex items-center justify-between rounded-lg border p-4">
                    <TSDiv>
                        <TSDiv tag="p"
                            className="text-base font-medium">{isServer ? 'Server-side transpiler' : 'Client-side hook transpiler'}</TSDiv>
                        <TSDiv tag="p" className="text-sm mt-1">{selectedDescription}</TSDiv>
                    </TSDiv>
                    <TSDiv tag="label" className="inline-flex items-center cursor-pointer select-none">
                        <TSDiv tag="span" className="mr-3 text-sm">Client</TSDiv>
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isServer}
                            onChange={(e) => setSetting(e.target.checked ? 'server-only' : 'client-only')}
                        />
                        <TSDiv
                            className="w-12 h-6 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors relative">
                            <TSDiv
                                className="absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-6" />
                        </TSDiv>
                        <TSDiv tag="span" className="ml-3 text-sm">Server</TSDiv>
                    </TSDiv>
                </TSDiv>
            </TSDiv>

            <TSDiv tag="section">
                <TSDiv className="flex items-center justify-between gap-4">
                    <TSDiv>
                        <TSDiv tag="h2" className="text-lg font-semibold">Active classes</TSDiv>
                        <TSDiv tag="p" className="text-sm">Currently applied classes in the UI.
                            Total: {classes.length}</TSDiv>
                    </TSDiv>
                    <TSDiv className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search classes..."
                            className="px-3 py-2 border rounded-lg text-sm bg-[var(--bg-surface)]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <TSDiv
                            tag="button"
                            type="button"
                            onClick={refreshClasses}
                            className="px-3 py-2 text-sm border rounded-lg"
                        >
                            Refresh
                        </TSDiv>
                    </TSDiv>
                </TSDiv>
                <TSDiv className="max-h-64 overflow-auto border rounded-md">
                    <TSDiv tag="ul" className="divide-y divide-[var(--border)]">
                        {filtered.map((c) => (
                            <TSDiv tag="li" key={c}
                                className="px-3 py-2 font-mono text-xs text-[var(--text)]">{c}</TSDiv>
                        ))}
                        {filtered.length === 0 && (
                            <TSDiv tag="li" className="px-3 py-2 text-sm">No classes match your search.</TSDiv>
                        )}
                    </TSDiv>
                </TSDiv>
                <TSDiv className="text-xs">Showing {filtered.length} of {classes.length}</TSDiv>
            </TSDiv>

            <TSDiv tag="section">
                <TSDiv className="flex items-center justify-between">
                    <TSDiv>
                        <TSDiv tag="h2" className="text-lg font-semibold">Themed Styler status</TSDiv>
                        <TSDiv tag="p" className="text-sm">Runtime injector visibility and registered classes.</TSDiv>
                    </TSDiv>
                    <TSDiv
                        tag="button"
                        type="button"
                        onClick={() => {
                            styleManager.requestRender()
                            refreshStylerStatus()
                        }}
                        className="px-3 py-2 text-sm border dark:rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Ensure CSS
                    </TSDiv>
                </TSDiv>
                <TSDiv className="grid grid-cols-2 gap-4">
                    <TSDiv className="space-y-2 text-sm">
                        <TSDiv className="flex items-center justify-between text-base font-medium">
                            Style tag
                            <TSDiv tag="span" className={stylerStatus.styleTag ? 'text-green-600' : 'text-red-500'}>
                                {stylerStatus.styleTag ? 'injected' : 'missing'}
                            </TSDiv>
                        </TSDiv>
                        <TSDiv className="text-xs">
                            {stylerStatus.selectors} selectors · {stylerStatus.classes} classes registered
                        </TSDiv>
                    </TSDiv>
                    <TSDiv>
                        <TSDiv tag="div"
                            className="text-xs font-mono text-[var(--text-code)] bg-[var(--bg-code)] rounded p-2 overflow-auto max-h-40">
                            {stylerStatus.cssPreview || 'No CSS generated yet.'}
                        </TSDiv>
                    </TSDiv>
                </TSDiv>
            </TSDiv>

            <TSDiv tag="section">
                {debugPanel.wasmError ? (
                    <TSDiv className="mb-3 p-3 bg-[var(--bg-error)] border border-[var(--border-error)] rounded">
                        <TSDiv className="font-semibold text-[var(--text-error)]">Themed-styler WebAssembly failed to
                            load</TSDiv>
                        <TSDiv className="text-xs text-[var(--text-error)] mt-1">Diagnostics:</TSDiv>
                        <TSDiv className="mt-2 text-xs">
                            <TSDiv><TSDiv tag="strong">Message:</TSDiv> {debugPanel.wasmError.message}</TSDiv>
                            {debugPanel.wasmError.stack ? <TSDiv tag="pre">{debugPanel.wasmError.stack}</TSDiv> : null}
                            <TSDiv className="mt-2 text-xs">Captured at: {debugPanel.wasmError.time}</TSDiv>
                            <TSDiv className="mt-2 text-xs text-[var(--text-secondary)]">Suggested actions: ensure the
                                wasm build step ran and that the wasm file is served correctly; check browser
                                console/network for errors.</TSDiv>
                        </TSDiv>
                    </TSDiv>
                ) : null}
                <TSDiv className="flex items-center justify-between mb-2">
                    <TSDiv className="font-semibold">Themed Styler — Debug</TSDiv>
                    <TSDiv className="space-x-2">
                        <TSDiv tag="button" onClick={refreshDebugPanel}
                            className="px-2 py-1 bg-blue-500 text-white rounded text-xs">Refresh</TSDiv>
                        <TSDiv tag="button" onClick={forceLoadFromManifest}
                            className="px-2 py-1 bg-green-500 text-white rounded text-xs">Force manifest load</TSDiv>
                        <TSDiv tag="button" onClick={copyCss}
                            className="px-2 py-1 bg-[var(--bg-secondary)] rounded text-xs">Copy CSS</TSDiv>
                    </TSDiv>
                </TSDiv>

                <TSDiv className="grid grid-cols-2 gap-3">
                    <TSDiv>
                        <TSDiv className="font-semibold mb-1">Generated CSS</TSDiv>
                        <TSDiv tag="pre">{debugPanel.css}</TSDiv>
                        <TSDiv className="font-semibold mt-3 mb-1">Themed-styler (full state)</TSDiv>
                        <JsonBlock value={debugPanel.themedStylerFullState} />
                        <TSDiv className="font-semibold mb-1">Usage Snapshot</TSDiv>
                        <JsonBlock value={debugPanel.usage} />
                        <TSDiv className="font-semibold mt-3 mb-1">Themed-styler (summary)</TSDiv>
                        <JsonBlock value={debugPanel.themesState} />
                        <TSDiv className="font-semibold mt-3 mb-1">Style Manager (raw)</TSDiv>
                        <JsonBlock
                            value={styleManager && (styleManager as Record<string, unknown>).state ? (styleManager as Record<string, unknown>).state : { available: Boolean(styleManager) }} />
                    </TSDiv>
                </TSDiv>
            </TSDiv>
        </TSDiv>
    )
}
