import React, { useState, useEffect, useRef } from 'react'

const STORAGE_KEY_PEERS = 'relay:peers'
const STORAGE_KEY_ACTIVE_TAB = 'relay:activeTab'
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export default function Home() {
    const [peers, setPeers] = useState([])
    const [newPeerInput, setNewPeerInput] = useState('')
    const [tabs, setTabs] = useState([{ id: 'home', label: 'Home', host: null }])
    const [activeTabId, setActiveTabId] = useState('home')
    const intervalRef = useRef(null)

    // Load peers from environment or localStorage
    const loadPeers = async () => {
        try {
            // Check localStorage first
            const stored = localStorage.getItem(STORAGE_KEY_PEERS)
            if (stored) {
                const peerList = JSON.parse(stored)
                if (Array.isArray(peerList) && peerList.length > 0) {
                    setPeers(peerList.map(host => ({ host, isProbing: false, probes: [] })))
                    return
                }
            }

            // Fallback to environment variable
            const envPeers = "https://node-dfw1.relaynet.online;https://node-dfw2.relaynet.online;http://localhost:8080"
            const peerList = envPeers.split(';').map(p => p.trim()).filter(p => p.length > 0)
            setPeers(peerList.map(host => ({ host, isProbing: false, probes: [] })))
        } catch (e) {
            console.error('[Home] Failed to load peers:', e)
        }
    }

    // Load active tab from localStorage
    const loadActiveTab = () => {
        try {
            const storedTab = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB)
            if (storedTab) {
                const { tabId, tabs: storedTabs } = JSON.parse(storedTab)
                if (storedTabs && Array.isArray(storedTabs)) {
                    setTabs(storedTabs)
                    setActiveTabId(tabId || 'home')
                }
            }
        } catch (e) {
            console.error('[Home] Failed to load active tab:', e)
        }
    }

    // Open peer in new tab
    const openPeerTab = (host) => {
        const existingTab = tabs.find(t => t.host === host)
        if (existingTab) {
            setActiveTabId(existingTab.id)
            return
        }

        const newTab = {
            id: `peer-${Date.now()}`,
            label: new URL(host).hostname,
            host
        }
        const updatedTabs = [...tabs, newTab]
        setTabs(updatedTabs)
        setActiveTabId(newTab.id)
    }

    // Close tab
    const closeTab = (e, tabId) => {
        e.stopPropagation()
        if (tabId === 'home') return

        const updatedTabs = tabs.filter(t => t.id !== tabId)
        setTabs(updatedTabs)

        if (activeTabId === tabId) {
            setActiveTabId('home')
        }
    }

    // Probe a peer
    const probePeer = async (host) => {
        setPeers(prev => prev.map(p => p.host === host ? { ...p, isProbing: true } : p))

        try {
            const startTime = Date.now()
            const response = await fetch(`${host}/api/info`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            })
            const latencyMs = Date.now() - startTime
            const data = await response.json()

            setPeers(prev => prev.map(p => {
                if (p.host === host) {
                    return {
                        ...p,
                        isProbing: false,
                        probes: [{ ok: true, latencyMs }],
                        reposWithBranches: data.repos || []
                    }
                }
                return p
            }))
        } catch (e) {
            setPeers(prev => prev.map(p => {
                if (p.host === host) {
                    return { ...p, isProbing: false, probes: [{ ok: false }] }
                }
                return p
            }))
        }
    }

    // Probe all peers
    const probeAllPeers = async () => {
        if (peers.length === 0) return
        await Promise.all(peers.map(p => probePeer(p.host)))
    }

    // Add peer
    const handleAddPeer = (e) => {
        e.preventDefault()
        const trimmedInput = newPeerInput.trim()
        if (trimmedInput) {
            try {
                new URL(trimmedInput)
                const newPeer = { host: trimmedInput, isProbing: false, probes: [] }
                const updatedPeers = [...peers, newPeer]
                setPeers(updatedPeers)
                localStorage.setItem(STORAGE_KEY_PEERS, JSON.stringify(updatedPeers.map(p => p.host)))
                setNewPeerInput('')
                probePeer(trimmedInput)
            } catch {
                alert('Please enter a valid URL (e.g., http://localhost:3000 or https://example.com)')
            }
        }
    }

    // Remove peer
    const handleRemovePeer = (e, host) => {
        e.stopPropagation()
        const updatedPeers = peers.filter(p => p.host !== host)
        setPeers(updatedPeers)
        localStorage.setItem(STORAGE_KEY_PEERS, JSON.stringify(updatedPeers.map(p => p.host)))
    }

    // Render probe status
    const renderProbeStatus = (peer) => {
        if (!peer.probes || peer.probes.length === 0) {
            return <span className="text-xs px-2 py-1 rounded whitespace-nowrap">Not probed</span>
        }

        const okProbes = peer.probes.filter(p => p.ok)
        if (okProbes.length === 0) {
            return <span className="text-xs px-2 py-1 rounded whitespace-nowrap bg-red-100 text-red-600 font-semibold">Offline</span>
        }

        const latency = okProbes[0].latencyMs
        return (
            <span className="text-xs px-2 py-1 rounded whitespace-nowrap bg-green-100 text-green-700 font-semibold">
                Online {latency ? `(${latency.toFixed(0)}ms)` : ''}
            </span>
        )
    }

    // Initial load
    useEffect(() => {
        loadPeers()
        loadActiveTab()
    }, [])

    // Probe all peers on initial load
    useEffect(() => {
        if (peers.length > 0) {
            probeAllPeers()
        }
    }, [peers.length])

    // Persist active tab
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, JSON.stringify({ tabId: activeTabId, tabs }))
        } catch (e) {
            console.error('[Home] Failed to persist active tab:', e)
        }
    }, [activeTabId, tabs])

    // Auto-refresh interval
    useEffect(() => {
        if (peers.length > 0) {
            intervalRef.current = setInterval(() => {
                probeAllPeers()
            }, AUTO_REFRESH_INTERVAL_MS)

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current)
                    intervalRef.current = null
                }
            }
        }
    }, [peers])

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b">
                <div className="flex items-center gap-3 mb-4">
                    <h2 className="m-0 text-xl font-semibold">Relay Peers</h2>
                </div>

                {/* Add peer form */}
                <form onSubmit={handleAddPeer} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="https://example.com"
                        value={newPeerInput}
                        onChange={(e) => setNewPeerInput(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        className="px-3 py-2 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 transition-colors"
                    >
                        Add
                    </button>
                </form>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1 p-2">
                {peers.length === 0 ? (
                    <div className="flex items-center justify-center h-full p-8 text-center">
                        <p className="m-0">No peers configured. Add one using the form above.</p>
                    </div>
                ) : (
                    peers.map((peer) => (
                        <div
                            key={peer.host}
                            className="p-4 bg-white border rounded-lg transition-all hover:bg-gray-50 hover:border-blue-500 hover:shadow-lg"
                        >
                            <div className="flex justify-between items-center gap-4 mb-2">
                                <div className="flex items-center gap-2 flex-1">
                                    <span className="font-semibold text-base">{peer.host}</span>
                                    {peer.isProbing && <span className="inline-block text-sm">⟳</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    {renderProbeStatus(peer)}
                                    <button
                                        onClick={(e) => handleRemovePeer(e, peer.host)}
                                        className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-all"
                                        title="Remove peer"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {peer.reposWithBranches && peer.reposWithBranches.length > 0 && (
                                <div className="text-sm space-y-2 mt-2">
                                    <div className="font-semibold">Repositories:</div>
                                    <div className="space-y-2 pl-2">
                                        {peer.reposWithBranches.map((repo) => (
                                            <div key={repo.name} className="space-y-1">
                                                <div className="font-mono text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded w-fit">
                                                    {repo.name}
                                                </div>
                                                <div className="space-y-1 pl-2">
                                                    {Object.entries(repo.branches || {}).map(([branch, commit]) => (
                                                        <div key={branch} className="flex items-center gap-2 text-xs">
                                                            <span className="font-semibold">{branch}:</span>
                                                            <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                                                {commit.substring(0, 7)}
                                                            </code>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                className="w-full px-2 py-2 mt-2 bg-blue-500 text-white border-none rounded cursor-pointer text-sm font-medium hover:bg-blue-600 transition-colors"
                                onClick={() => probePeer(peer.host)}
                            >
                                Refresh Probe
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
