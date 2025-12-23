// Test transpiler with simple JSX
if (globalThis.__hook_transpile_jsx) {
    try {
        const testCode = 'const x = <div>test</div>; export default x;'
        const result = globalThis.__hook_transpile_jsx(testCode, 'test.jsx')
        console.log('[main] Transpiler test result:', { hasCreateElement: result.includes('createElement'), resultLength: result.length, resultPreview: result.substring(0, 100) })
    } catch (e) {
        console.error('[main] Transpiler test failed:', e)
    }
}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IsolatedHookRenderer } from './components/IsolatedHookRenderer'
import { ErrorBoundary } from '@clevertree/hook-transpiler'
import { unifiedBridge } from '@clevertree/themed-styler'
import { initHookTranspiler, initThemedStylerWasm } from './utils/wasmInit'

async function bootstrap() {
    console.log('[main] Starting bootstrap...')
    let initError: Error | undefined
    try {
        // Initialize both WASM modules with custom init to use import.meta.url
        try {
            console.log('[main] Initializing transpiler...')
            await initHookTranspiler()
            console.log('[main] ✓ Transpiler initialized')

            console.log('[main] Initializing themed-styler...')
            await initThemedStylerWasm()
            console.log('[main] ✓ Themed-styler initialized')

            console.log('[main] Loading defaults...')
            // After wasm runtime initialized, attempt to populate default themes
            const { ensureDefaultsLoaded, styleManager } = await import('@clevertree/themed-styler')
            if (typeof ensureDefaultsLoaded === 'function') {
                await ensureDefaultsLoaded()
                console.log('[main] ✓ Defaults loaded')
            }
            if (styleManager && typeof styleManager.startAutoSync === 'function') {
                styleManager.startAutoSync()
                console.log('[main] ✓ Auto-sync started')
            }
        } catch (e) {
            console.warn('[main] wasm init failed', e)
            initError = e instanceof Error ? e : new Error(String(e))
        }
    } catch (error) {
        initError = error instanceof Error ? error : new Error(String(error))
        console.error('[main] Bootstrap error:', initError)
    }

    console.log('[main] Creating root...')
    const rootElement = document.getElementById('root')
    if (!rootElement) {
        console.error('[main] Root element not found!')
        return
    }

    console.log('[main] Rendering app via HookRenderer...')
    createRoot(rootElement).render(
        <StrictMode>
            <ErrorBoundary
                initialError={initError}
                onElement={(tag, props) => unifiedBridge.registerUsage(tag, props)}
            >
                <IsolatedHookRenderer
                    host=""
                    hookPath="/hooks/app.jsx"
                    onElement={(tag, props) => unifiedBridge.registerUsage(tag, props)}
                    requestRender={() => unifiedBridge.requestRender?.()}
                    renderCssIntoDom={() => unifiedBridge.renderCssIntoDom?.()}
                    startAutoSync={(interval) => unifiedBridge.startAutoSync?.(interval)}
                    stopAutoSync={() => unifiedBridge.stopAutoSync?.()}
                    registerTheme={(name, defs) => unifiedBridge.registerTheme?.(name, defs)}
                    loadThemesFromYamlUrl={(url) => unifiedBridge.loadThemesFromYamlUrl?.(url)}
                />
            </ErrorBoundary>
        </StrictMode>,
    )
    console.log('[main] Render complete')
}

bootstrap()
