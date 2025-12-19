import React, { useState } from 'react'
import { TSDiv } from './TSDiv'
import HookRenderer from './HookRenderer'

export function TestTab() {
    const [testPath, setTestPath] = useState('/hooks/client/get-client.jsx')
    const [currentPath, setCurrentPath] = useState('/hooks/client/get-client.jsx')
    const transpilerVersion = (globalThis as any).__hook_transpiler_version || 'not loaded'

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setCurrentPath(testPath)
    }

    return (
        <TSDiv className="flex flex-col h-full w-full">
            <TSDiv className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                <TSDiv className="flex items-baseline justify-between mb-3">
                    <TSDiv tag="h2" className="text-xl font-bold">Test Static Template</TSDiv>
                    <TSDiv className="text-xs text-[var(--text-secondary)]">
                        Transpiler: v{transpilerVersion}
                    </TSDiv>
                </TSDiv>
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <TSDiv tag="label" className="flex-1 flex flex-col gap-1">
                        <TSDiv tag="span" className="text-sm font-medium">Hook Path:</TSDiv>
                        <input
                            type="text"
                            value={testPath}
                            onChange={(e) => setTestPath(e.target.value)}
                            className="px-3 py-2 border border-[var(--border)] rounded bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            placeholder="/hooks/client/get-client.jsx"
                        />
                    </TSDiv>
                    <TSDiv className="flex items-end">
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[var(--bg-accent)] text-[var(--text-accent)] rounded hover:opacity-80 font-medium"
                        >
                            Load
                        </button>
                    </TSDiv>
                </form>
                <TSDiv className="text-sm text-[var(--text-secondary)] mt-2">
                    Testing against static template at /{currentPath}
                </TSDiv>
            </TSDiv>
            <TSDiv className="flex-1 overflow-hidden">
                <HookRenderer
                    host={`${window.location.protocol}//${window.location.host}`}
                    hookPath={currentPath}
                />
            </TSDiv>
        </TSDiv>
    )
}
