import React, { useState, useEffect } from 'react'
import { unifiedBridge, styleManager } from '@clevertree/themed-styler'

export default function Settings() {
    const [currentTheme, setCurrentTheme] = useState('dark')
    const [availableThemes, setAvailableThemes] = useState([])
    const [debugInfo, setDebugInfo] = useState(null)
    const [reactLibrary, setReactLibrary] = useState('react')

    // Load debug info and theme state
    useEffect(() => {
        const info = {
            // Hook transpiler version
            transpilerVersion: globalThis.__hook_transpiler_version || 'not loaded',

            // Themed styler version
            themedStylerVersion: globalThis.__themedStylerVersion || 'not loaded',

            // Check for themed-styler bridge
            themedStylerBridge: typeof globalThis.__bridgeGetThemes === 'function' ? 'loaded' : 'not loaded',

            // Get usage snapshot if available
            usageSnapshot: null,

            // Get themes state
            themesState: null,

            // Check for WASM functions
            wasmFunctions: {
                transpile: typeof globalThis.__hook_transpile_jsx === 'function',
                renderCss: typeof globalThis.__themedStylerRenderCss === 'function',
                getThemeList: typeof globalThis.__themedStylerGetThemeList === 'function',
            }
        }

        // Try to get usage snapshot from themed-styler bridge
        try {
            if (typeof globalThis.__bridgeGetUsageSnapshot === 'function') {
                info.usageSnapshot = globalThis.__bridgeGetUsageSnapshot()
            }
        } catch (e) {
            console.error('[Settings] Failed to get usage snapshot:', e)
        }

        // Try to get themes state
        try {
            if (typeof globalThis.__bridgeGetThemes === 'function') {
                info.themesState = globalThis.__bridgeGetThemes()
                if (info.themesState?.currentTheme) {
                    setCurrentTheme(info.themesState.currentTheme)
                }
            }
        } catch (e) {
            console.error('[Settings] Failed to get themes state:', e)
        }

        // Try to get available themes
        try {
            if (typeof globalThis.__themedStylerGetThemeList === 'function') {
                const themeListJson = globalThis.__themedStylerGetThemeList()
                const themeList = JSON.parse(themeListJson || '[]')
                setAvailableThemes(themeList)
            } else if (info.themesState?.themes) {
                // Fallback: get themes from bridge state
                const themes = Object.keys(info.themesState.themes).map(key => ({
                    key,
                    name: info.themesState.themes[key]?.name || key
                }))
                setAvailableThemes(themes)
            }
        } catch (e) {
            console.error('[Settings] Failed to get theme list:', e)
        }

        setDebugInfo(info)

        // Load React library preference
        const savedLibrary = localStorage.getItem('relay:react-library')
        if (savedLibrary) {
            setReactLibrary(savedLibrary)
        }
    }, [])

    // Handle theme change
    const handleThemeChange = (e) => {
        const newTheme = e.target.value
        setCurrentTheme(newTheme)

        // Propagate theme to themed-styler and trigger CSS rebuild
        try {
            if (unifiedBridge?.setCurrentTheme) {
                unifiedBridge.setCurrentTheme(newTheme)
            } else if (typeof globalThis.__bridgeSetCurrentTheme === 'function') {
                globalThis.__bridgeSetCurrentTheme(newTheme)
            }
        } catch (err) {
            console.error('[Settings] Failed to set theme via themed-styler bridge:', err)
        }

        try {
            styleManager?.requestRender?.()
            styleManager?.renderCssIntoDom?.()
        } catch (err) {
            console.error('[Settings] Failed to render themed CSS after theme change:', err)
        }

        // Apply theme to document root for any CSS variables that depend on data-theme
        document.documentElement.setAttribute('data-theme', newTheme)
    }

    // Handle React library change
    const handleReactLibraryChange = (e) => {
        const newLibrary = e.target.value
        setReactLibrary(newLibrary)
        localStorage.setItem('relay:react-library', newLibrary)

        // Show confirmation that reload is needed
        alert(`React library changed to ${newLibrary}. Reload the page to apply changes.`)
    }

    return (
        <div className="p-6 max-w-4xl">
            <h1 className="text-2xl font-bold mb-6">Relay Settings</h1>
            <p className="text-sm text-gray-600 mb-6">Control how hooks are transpiled.</p>

            {/* Theme Section */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Theme</h2>
                <p className="text-sm text-gray-600 mb-4">Choose your preferred color theme.</p>

                <div className="border rounded-lg p-4">
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Appearance</label>
                        <p className="text-xs text-gray-500 mb-2">Select a theme for the application interface</p>
                        <select
                            value={currentTheme}
                            onChange={handleThemeChange}
                            className="w-full md:w-64 px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        >
                            {availableThemes.length > 0 ? (
                                availableThemes.map(theme => (
                                    <option key={theme.key} value={theme.key}>
                                        {theme.name}
                                    </option>
                                ))
                            ) : (
                                <>
                                    <option value="light">Light Theme</option>
                                    <option value="dark">Dark Theme</option>
                                    <option value="system">System Default</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>
            </div>

            {/* Transpiler Section */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Transpiler</h2>

                <div className="border rounded-lg p-4">
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Default React/Act Library</label>
                        <p className="text-xs text-gray-500 mb-2">Choose which JSX runtime to use</p>
                        <select
                            value={reactLibrary}
                            onChange={handleReactLibraryChange}
                            className="w-full md:w-64 px-3 py-2 border rounded focus:outline-none focus:border-blue-500"
                        >
                            <option value="react">React (Standard)</option>
                            <option value="act">Act (Lightweight)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-2">
                            Current: <span className="font-mono font-semibold">{reactLibrary}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Debug Panel */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Debug Panel</h2>

                <div className="border rounded-lg p-4 bg-gray-50">
                    {debugInfo ? (
                        <div className="space-y-4">
                            {/* Versions */}
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Crate Versions</h3>
                                <div className="space-y-1 text-xs font-mono">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Hook Transpiler:</span>
                                        <span className="font-semibold">{debugInfo.transpilerVersion}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Themed Styler:</span>
                                        <span className="font-semibold">{debugInfo.themedStylerVersion}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Styler Bridge:</span>
                                        <span className="font-semibold">{debugInfo.themedStylerBridge}</span>
                                    </div>
                                </div>
                            </div>

                            {/* WASM Functions */}
                            <div>
                                <h3 className="text-sm font-semibold mb-2">WASM Functions</h3>
                                <div className="space-y-1 text-xs">
                                    {Object.entries(debugInfo.wasmFunctions).map(([key, value]) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className={`inline-block w-2 h-2 rounded-full ${value ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            <span className="font-mono">{key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Themed Styler State */}
                            {debugInfo.themesState && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-2">Themed Styler State</h3>
                                    <div className="text-xs font-mono bg-white p-2 rounded border overflow-x-auto">
                                        <div className="mb-2">
                                            <span className="text-gray-600">Current Theme:</span>{' '}
                                            <span className="font-semibold">{debugInfo.themesState.currentTheme || 'none'}</span>
                                        </div>
                                        <div className="mb-2">
                                            <span className="text-gray-600">Available Themes:</span>{' '}
                                            <span className="font-semibold">
                                                {Object.keys(debugInfo.themesState.themes || {}).join(', ') || 'none'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Usage Snapshot */}
                            {debugInfo.usageSnapshot && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-2">Active Classes & Selectors</h3>
                                    <div className="text-xs">
                                        <div className="mb-3">
                                            <span className="font-semibold text-gray-700">Tags ({debugInfo.usageSnapshot.tags?.size || 0}):</span>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {debugInfo.usageSnapshot.tags && Array.from(debugInfo.usageSnapshot.tags).slice(0, 20).map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">
                                                        {tag}
                                                    </span>
                                                ))}
                                                {debugInfo.usageSnapshot.tags?.size > 20 && (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                        +{debugInfo.usageSnapshot.tags.size - 20} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700">Classes ({debugInfo.usageSnapshot.classes?.size || 0}):</span>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {debugInfo.usageSnapshot.classes && Array.from(debugInfo.usageSnapshot.classes).slice(0, 20).map(cls => (
                                                    <span key={cls} className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-mono text-xs">
                                                        {cls}
                                                    </span>
                                                ))}
                                                {debugInfo.usageSnapshot.classes?.size > 20 && (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                        +{debugInfo.usageSnapshot.classes.size - 20} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">Loading debug info...</p>
                    )}
                </div>
            </div>
        </div>
    )
}
