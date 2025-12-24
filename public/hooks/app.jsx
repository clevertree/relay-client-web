// Main application hook - entry point for runtime-transpiled JSX
// Renders the entire app using themed-styler and hook-transpiler
import React, { useState, useEffect, lazy, Suspense } from 'react'
import ErrorBoundary from './errorBoundary.jsx'

// Lazy load page components
const Home = lazy(() => import('./home.jsx'))
const Settings = lazy(() => import('./settings.jsx'))

// Loading fallback component
function LoadingFallback() {
    return (
        <div className="flex items-center justify-center h-full w-full">
            <div className="text-center">
                <p className="text-base">Loading...</p>
            </div>
        </div>
    )
}

export default function App() {
    if (!React || !useState || !useEffect) {
        throw new Error('React runtime not provided to hook')
    }
    const [activeTab, setActiveTab] = useState('settings')
    const [tabs] = useState([
        { id: 'home', title: 'Home', isHome: true },
        { id: 'settings', title: 'Settings' }
    ])

    // Apply theme on mount
    useEffect(() => {
        // Theme will be applied by styler
        console.log('[App Hook] Mounted')
    }, [])

    const handleTabClick = (tabId) => {
        setActiveTab(tabId)
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return <Home />
            case 'settings':
                return <Settings />
            default:
                return (
                    <div className="flex items-center justify-center h-full w-full">
                        <div className="text-center">
                            <h2 className="mb-2 text-2xl font-semibold">No content</h2>
                            <p className="text-base">Select a tab</p>
                        </div>
                    </div>
                )
        }
    }

    return (
        <div className="flex flex-col w-screen h-screen bg-primary theme">
            {/* Tab Bar */}
            <div className="border-b overflow-x-auto overflow-y-hidden">
                <div className="flex gap-1 p-0 min-h-11 items-center">
                    <div className="flex gap-1">
                        {tabs.map((tab) => {
                            const isActive = tab.id === activeTab
                            return (
                                <div
                                    key={tab.id}
                                    className={`flex items-center gap-2 px-4 py-2 border border-b-2 rounded-t-lg cursor-pointer transition-all flex-shrink-0 min-w-32 max-w-60 ${isActive
                                        ? 'border-b-blue-500 font-semibold bg-surface'
                                        : 'border-b-transparent'
                                        }`}
                                    onClick={() => handleTabClick(tab.id)}
                                >
                                    <span
                                        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm"
                                        title={tab.title}
                                    >
                                        {tab.title}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 flex flex-col overflow-hidden">
                    <ErrorBoundary>
                        <Suspense fallback={<LoadingFallback />}>
                            {renderContent()}
                        </Suspense>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    )
}
