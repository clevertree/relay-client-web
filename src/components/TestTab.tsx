import { TSDiv } from './TSDiv'
import HookRenderer from './ThemedHookRenderer'

const HOOK_PATH = '/hooks/client/get-client.jsx'
const HOOK_HOST = 'http://localhost:8002'
export function TestTab() {
    const transpilerVersion = (globalThis as any).__hook_transpiler_version || 'not loaded'

    return (
        <TSDiv className="flex flex-col h-full w-full">
            <TSDiv className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                <TSDiv className="flex items-baseline justify-between mb-3">
                    <TSDiv tag="h2" className="text-xl font-bold">Test Static Template</TSDiv>
                    <TSDiv className="text-xs text-[var(--text-secondary)]">
                        Transpiler: v{transpilerVersion}
                    </TSDiv>
                </TSDiv>
                <TSDiv className="text-sm text-[var(--text-secondary)] mt-2">
                    Testing against static template at {HOOK_HOST}{HOOK_PATH}.
                </TSDiv>
            </TSDiv>
            <TSDiv className="flex-1 overflow-hidden">
                <HookRenderer
                    host={HOOK_HOST}
                    hookPath={HOOK_PATH}
                />
            </TSDiv>
        </TSDiv>
    )
}
