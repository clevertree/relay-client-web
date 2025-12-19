import { useState, useEffect } from 'react'
import { useAppState } from './state/store'
import { PeersView } from './components/PeersView'
import { TabBar } from './components/TabBar'
import { RepoBrowser } from './components/RepoBrowser'
import { SettingsTab } from './components/SettingsTab'
import { TestTab } from './components/TestTab'
import { PluginProvider } from './plugins/PluginContext'
import { webPlugin } from './plugins/web'
import { TSDiv } from './components/TSDiv.tsx'
import { unifiedBridge } from '@relay/shared'

function App() {
  const activeTabId = useAppState((s) => s.activeTabId)
  const openTab = useAppState((s) => s.openTab)
  const theme = useAppState((s) => s.theme)
  const [initialized, setInitialized] = useState(false)

  // Initialize state on mount (restores from localStorage)
  if (!initialized) {
    setInitialized(true)
  }

  // Apply theme on mount and when theme changes
  useEffect(() => {
    if (unifiedBridge.setCurrentTheme) {
      unifiedBridge.setCurrentTheme(theme)
    }
  }, [theme])

  const handlePeerPress = (host: string) => {
    openTab(host, '/')
  }

  return (
    <PluginProvider plugin={webPlugin}>
      <TSDiv className="flex flex-col w-screen h-screen bg-primary theme">
        <TabBar />
        <TSDiv className="flex flex-1 overflow-hidden">
          <TSDiv tag='main' className="flex-1 flex flex-col overflow-hidden">
            {activeTabId === 'home' ? (
              <PeersView onPeerPress={handlePeerPress} />
            ) : activeTabId === 'settings' ? (
              <SettingsTab />
            ) : activeTabId === 'test' ? (
              <TestTab />
            ) : activeTabId ? (
              <RepoBrowser tabId={activeTabId} />
            ) : (
              <TSDiv className="flex items-center justify-center h-full w-full">
                <TSDiv className="text-center">
                  <TSDiv tag='h2' className="mb-2 text-2xl font-semibold">No repositories open</TSDiv>
                  <TSDiv tag='p' className="text-base">Select a peer from the home tab to browse its
                    repositories.</TSDiv>
                </TSDiv>
              </TSDiv>
            )}
          </TSDiv>
        </TSDiv>
      </TSDiv>
    </PluginProvider>
  )
}

export default App
