import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import App from './App.tsx'
// wasm loader consolidated in @clevertree/client-shared
import ErrorBoundary from './components/ErrorBoundary'

async function bootstrap() {
    let initError: Error | undefined
    try {
        // Initialize both WASM modules (hook-transpiler + themed-styler)
        try {
            const { initTranspiler } = await import('@clevertree/hook-transpiler')
            const { initThemedStyler } = await import('@clevertree/themed-styler')
            await initTranspiler()
            await initThemedStyler()
            
            // After wasm runtime initialized, attempt to populate default themes
            const { ensureDefaultsLoaded, styleManager } = await import('@clevertree/themed-styler')
            if (typeof ensureDefaultsLoaded === 'function') {
                await ensureDefaultsLoaded()
            }
            if (styleManager && typeof styleManager.startAutoSync === 'function') {
                styleManager.startAutoSync()
            }
        } catch (e) {
            console.warn('[main] wasm init failed', e)
        }
    } catch (error) {
        initError = error instanceof Error ? error : new Error(String(error))
    }

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <ErrorBoundary initialError={initError}>
                <App/>
            </ErrorBoundary>
        </StrictMode>,
    )
}

bootstrap()
