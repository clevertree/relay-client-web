/**
 * IsolatedHookRenderer - Wraps HookRenderer to ensure clean React instance
 * 
 * This component creates an isolation boundary to prevent any act/dom contamination
 * from reaching the hook execution context. It explicitly uses only the bundled
 * React and ReactDOM from the parent application.
 */

import React, { useEffect, useState } from 'react'
import { HookRenderer } from '@clevertree/hook-transpiler/web'

interface IsolatedHookRendererProps {
    host: string
    hookPath: string
    onElement?: (tag: string, props: any) => void
    requestRender?: () => void
    renderCssIntoDom?: () => void
    startAutoSync?: (interval?: number) => void
    stopAutoSync?: () => void
    registerTheme?: (name: string, defs?: any) => void
    loadThemesFromYamlUrl?: (url: string) => Promise<void>
}

export function IsolatedHookRenderer(props: IsolatedHookRendererProps) {
    const [isolated, setIsolated] = useState(false)

    useEffect(() => {
        // Clear any global contamination before rendering hooks
        console.log('[IsolatedHookRenderer] Cleaning globals...')

        // Remove any act references that might confuse React
        try {
            delete (globalThis as any).act
            delete (globalThis as any).Act
            delete (window as any).act
            delete (window as any).Act
        } catch (e) {
            console.warn('[IsolatedHookRenderer] Could not clear act globals:', e)
        }

        // Ensure we're using the bundled React, not any injected version
        // Force React to be the one from our bundle
        const ReactFromBundle = require('react')
        const ReactDOMFromBundle = require('react-dom')

            // Set globals to use our clean React
            ; (globalThis as any).__hook_react = ReactFromBundle
            ; (globalThis as any).__hook_react_dom = ReactDOMFromBundle

        console.log('[IsolatedHookRenderer] ✓ Isolation complete, React version:', ReactFromBundle.version)
        setIsolated(true)
    }, [])

    if (!isolated) {
        return <div>Initializing isolated environment...</div>
    }

    return <HookRenderer {...props} />
}
