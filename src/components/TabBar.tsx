import React from 'react'
import { useAppState } from '../state/store'
import { TSDiv } from './TSDiv'

interface TabBarProps {
  onTabChange?: (tabId: string) => void
}

export function TabBar({ onTabChange }: TabBarProps) {
  const tabs = useAppState((s) => s.tabs)
  const activeTabId = useAppState((s) => s.activeTabId)
  const setActiveTab = useAppState((s) => s.setActiveTab)
  const closeTab = useAppState((s) => s.closeTab)

  if (tabs.length === 0) return null

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    onTabChange?.(tabId)
  }

  const handleCloseTab = (event: React.MouseEvent<HTMLButtonElement>, tabId: string) => {
    event.stopPropagation()
    closeTab(tabId)
  }

  return (
    <TSDiv className="border-b overflow-x-auto overflow-y-hidden">
      <TSDiv className="flex gap-1 p-0 min-h-11 items-center">
        <TSDiv className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <TSDiv
                key={tab.id}
                className={`flex items-center gap-2 px-4 py-2 border border-b-2 rounded-t-lg cursor-pointer transition-all flex-shrink-0 min-w-32 max-w-60 ${isActive
                  ? 'border-b-blue-500 font-semibold bg-[var(--bg-surface)]'
                  : 'border-b-transparent'
                  }`}
                onClick={() => handleTabClick(tab.id)}
              >
                <TSDiv
                  tag="span"
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[var(--text)]"
                  title={tab.title}
                >
                  {tab.title}
                </TSDiv>
                {!tab.isHome && tab.id !== 'settings' && (
                  <TSDiv
                    tag="button"
                    onClick={(event: any) => handleCloseTab(event, tab.id)}
                    className="border-none bg-transparent text-xl cursor-pointer text-[var(--text-secondary)] p-0 w-6 h-6 flex items-center justify-center rounded transition-all flex-shrink-0"
                    aria-label="Close tab"
                  >
                    ×
                  </TSDiv>
                )}
              </TSDiv>
            )
          })}
        </TSDiv>
        {/* Settings now exists as a persistent tab; button removed */}
        <TSDiv className="ml-auto flex items-center pr-2" />
      </TSDiv>
    </TSDiv>
  )
}
