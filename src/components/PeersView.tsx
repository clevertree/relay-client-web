import {useCallback, useEffect, useRef, useState} from 'react'
import {type PeerInfo, STORAGE_KEY_PEERS, useAppState} from '../state/store'
import {fullProbePeer} from '../services/probing'
import {TSDiv} from './TSDiv'

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface PeersViewProps {
    onPeerPress?: (host: string) => void
}

export function PeersView({onPeerPress}: PeersViewProps) {
    const peers = useAppState((s) => s.peers)
    const setPeers = useAppState((s) => s.setPeers)
    const updatePeer = useAppState((s) => s.updatePeer)
    const setPeerProbing = useAppState((s) => s.setPeerProbing)
    const setLastRefreshTs = useAppState((s) => s.setLastRefreshTs)
    const addPeer = useAppState((s) => s.addPeer)
    const removePeer = useAppState((s) => s.removePeer)
    const [newPeerInput, setNewPeerInput] = useState('')
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Probe a single peer
    const probePeer = useCallback(
        async (host: string) => {
            setPeerProbing(host, true)
            try {
                const result = await fullProbePeer(host)
                updatePeer(host, (p) => ({
                    ...p,
                    probes: result.probes,
                    lastUpdateTs: result.lastUpdateTs,
                    branches: result.branches,
                    repos: result.repos,
                    isProbing: false,
                }))
            } catch (e) {
                updatePeer(host, (p) => ({
                    ...p,
                    isProbing: false,
                }))
            }
        },
        [setPeerProbing, updatePeer],
    )

    // Probe all peers
    const probeAllPeers = useCallback(async () => {
        const currentPeers = useAppState.getState().peers
        await Promise.all(currentPeers.map((p) => probePeer(p.host)))
        setLastRefreshTs(Date.now())
    }, [probePeer, setLastRefreshTs])

    // Load peers from environment (simulate fetching from tracker)
    const loadAndProbePeers = useCallback(async () => {
        console.log('[loadAndProbePeers] Starting...')
        try {
            // Parse peers from environment variable or URL params
            const envPeers = await getPeersFromEnvironment()
            console.log('[loadAndProbePeers] Got peers:', envPeers)
            console.log('[loadAndProbePeers] Calling setPeers with:', envPeers)
            setPeers(envPeers)
            console.log('[loadAndProbePeers] setPeers called, current state:', useAppState.getState().peers)
            // Probe all peers after setting them
            await Promise.all(envPeers.map((host: string) => probePeer(host)))
            setLastRefreshTs(Date.now())
        } catch (e) {
            console.error('[loadAndProbePeers] Error:', e)
        }
    }, [setPeers, probePeer, setLastRefreshTs])

    // Setup auto-refresh interval (always enabled, 5 minutes)
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            probeAllPeers()
        }, AUTO_REFRESH_INTERVAL_MS)
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [probeAllPeers])

    // Initial load
    useEffect(() => {
        console.log('[PeersView] Initial load useEffect triggered')
        loadAndProbePeers().catch((e) => console.error('[PeersView] Load error:', e))
        // Run only once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Get status and probe info
    const renderProbeStatus = (peer: PeerInfo) => {
        if (!peer.probes || peer.probes.length === 0) {
            return <TSDiv
                tag="span"
                className="text-xs px-2 py-1 rounded whitespace-nowrap">Not probed</TSDiv>
        }

        const okProbes = peer.probes.filter((p) => p.ok)
        if (okProbes.length === 0) {
            return <TSDiv
                tag="span"
                className="text-xs px-2 py-1 rounded whitespace-nowrap bg-red-100/50 text-red-600 font-semibold">Offline</TSDiv>
        }

        const latency = okProbes[0].latencyMs
        return (
            <TSDiv tag="span"
                   className="text-xs px-2 py-1 rounded whitespace-nowrap bg-green-100/50 text-green-700 font-semibold">
                Online {latency ? `(${latency.toFixed(0)}ms)` : ''}
            </TSDiv>
        )
    }

    const handlePeerPress = (host: string) => {
        onPeerPress?.(host)
    }

    const handleAddPeer = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmedInput = newPeerInput.trim()
        if (trimmedInput) {
            // Validate URL format
            try {
                new URL(trimmedInput)
                addPeer(trimmedInput)
                setNewPeerInput('')
                // Probe the new peer immediately
                probePeer(trimmedInput)
            } catch {
                alert('Please enter a valid URL (e.g., http://localhost:3000 or https://example.com)')
            }
        }
    }

    const handleRemovePeer = (e: React.MouseEvent, host: string) => {
        e.stopPropagation()
        removePeer(host)
    }

    return (
        <TSDiv className="flex flex-col h-full border-r">
            <TSDiv className="p-4 border-b">
                <TSDiv className="flex items-center gap-3 mb-4">
                    <TSDiv tag="img" src="/icon.png" alt="Relay" width="24" height="24" className="flex-shrink-0"/>
                    <TSDiv tag="h2" className="m-0 text-xl font-semibold">Relay</TSDiv>
                </TSDiv>

                {/* Add peer input form */}
                <TSDiv tag="form" onSubmit={handleAddPeer} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="https://example.com"
                        value={newPeerInput}
                        onChange={(e) => setNewPeerInput(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    <TSDiv
                        tag="button"
                        {...({type: 'submit'} as any)}
                        className="px-3 py-2 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 transition-colors"
                    >
                        Add
                    </TSDiv>
                </TSDiv>
            </TSDiv>

            <TSDiv className="flex-1 overflow-y-auto flex flex-col gap-1 p-2">
                {peers.length === 0 ? (
                    <TSDiv className="flex items-center justify-center h-full p-8 text-center">
                        <TSDiv tag="p" className="m-0">No peers configured. Add one using the form above or set
                            RELAY_PUBLIC_MASTER_PEER_LIST
                            environment variable.</TSDiv>
                    </TSDiv>
                ) : (
                    peers.map((peer) => (
                        <TSDiv
                            key={peer.host}
                            className="p-4 bg-white border rounded-lg cursor-pointer transition-all hover:bg-gray-50 hover:border-blue-500 hover:shadow-lg group"
                            onClick={() => handlePeerPress(peer.host)}
                        >
                            <TSDiv className="flex justify-between items-center gap-4 mb-2">
                                <TSDiv className="flex items-center gap-2 flex-1">
                                    <TSDiv tag="span" className="font-semibold text-base">{peer.host}</TSDiv>
                                    {peer.isProbing &&
                                        <TSDiv tag="span" className="inline-block text-sm animation-spin">⟳</TSDiv>}
                                </TSDiv>
                                <TSDiv className="flex items-center gap-2">
                                    {renderProbeStatus(peer)}
                                    <TSDiv
                                        tag="button"
                                        onClick={(e) => handleRemovePeer(e, peer.host)}
                                        className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-all"
                                        title="Remove peer"
                                    >
                                        ✕
                                    </TSDiv>
                                </TSDiv>
                            </TSDiv>

                            {peer.reposWithBranches && peer.reposWithBranches.length > 0 && (
                                <TSDiv className="text-sm space-y-2 mt-2">
                                    <TSDiv className="font-semibold">Repositories:</TSDiv>
                                    <TSDiv className="space-y-2 pl-2">
                                        {peer.reposWithBranches.map((repo) => (
                                            <TSDiv key={repo.name} className="space-y-1">
                                                <TSDiv
                                                    className="font-mono text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded w-fit">
                                                    {repo.name}
                                                </TSDiv>
                                                <TSDiv className="space-y-1 pl-2">
                                                    {Object.entries(repo.branches).map(([branch, commit]) => (
                                                        <TSDiv key={branch} className="flex items-center gap-2 text-xs">
                                                            <TSDiv tag="span"
                                                                   className="font-semibold">{branch}:</TSDiv>
                                                            <TSDiv tag="code"
                                                                   className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                                                {commit.substring(0, 7)}
                                                            </TSDiv>
                                                        </TSDiv>
                                                    ))}
                                                </TSDiv>
                                            </TSDiv>
                                        ))}
                                    </TSDiv>
                                </TSDiv>
                            )}

                            <TSDiv
                                tag="button"
                                className="w-full px-2 py-2 mt-2 bg-blue-500 text-white border-none rounded cursor-pointer text-sm font-medium hover:bg-blue-600 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handlePeerPress(peer.host)
                                }}
                            >
                                Open →d
                            </TSDiv>
                        </TSDiv>
                    ))
                )}
            </TSDiv>
        </TSDiv>
    )
}

/**
 * Get peers from environment or URL params
 */
async function getPeersFromEnvironment(): Promise<string[]> {
    console.log('[getPeersFromEnvironment] Starting peer resolution...')

    // Check localStorage first (user-customized peer list)
    try {
        const stored = localStorage.getItem(STORAGE_KEY_PEERS)
        if (stored) {
            const peers = JSON.parse(stored) as string[]
            if (Array.isArray(peers) && peers.length > 0) {
                // Keep peers as-is with their full URLs
                const cleanPeers = peers.map(p => p.trim()).filter(p => p.length > 0)
                console.log('[getPeersFromEnvironment] Loaded from localStorage (overrides env):', cleanPeers)
                return cleanPeers
            }
        }
    } catch (e) {
        console.log('[getPeersFromEnvironment] Failed to load from localStorage:', e)
    }

    // Check Vite environment variables (only available after full rebuild with .env)
    const envPeers = import.meta.env.RELAY_PUBLIC_MASTER_PEER_LIST || "https://node-dfw1.relaynet.online;https://node-dfw2.relaynet.online"
    console.log('[getPeersFromEnvironment] RELAY_PUBLIC_MASTER_PEER_LIST:', envPeers)
    if (envPeers) {
        const peers = envPeers.split(';').map((p: string) => p.trim()).filter((p: string) => p.length > 0)
        console.log('[getPeersFromEnvironment] Loaded from build-time env:', peers)
        return peers
    }

    // Check for default local server
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Running locally, assume server on same host
        const port = window.location.port || '8088'
        console.log('[getPeersFromEnvironment] Using local server:', `${hostname}:${port}`)
        return [`${hostname}:${port}`]
    }

    // Try to get from global config (would be set by server)
    if ((window as any).RELAY_PUBLIC_MASTER_PEER_LIST) {
        console.log('[getPeersFromEnvironment] Loaded from window.RELAY_PUBLIC_MASTER_PEER_LIST:', (window as any).RELAY_PUBLIC_MASTER_PEER_LIST)
        return (window as any).RELAY_PUBLIC_MASTER_PEER_LIST.split(',').map((p: string) => p.trim())
    }

    // Fallback: try localhost
    console.log('[getPeersFromEnvironment] Fallback to localhost:8080')
    return ['localhost:8080']
}
