import React, { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../state/store'
import { RepoFetchProvider } from '../context/RepoFetchContext'
import HookRenderer from './HookRenderer'
import ErrorBoundary from './ErrorBoundary'
import { TSDiv } from './TSDiv'

interface RepoBrowserProps {
    tabId: string
}

interface OptionsInfo {
    // Entire OPTIONS payload merged from .relay.yaml + server additions
    client?: {
        hooks?: {
            get?: { path: string }
            query?: { path: string }
        }
    }
    repos?: { name: string; branches: Record<string, string> }[]
    capabilities?: { supports: string[] }

    [key: string]: any
}

/**
 * Helper to normalize host URL - ensures proper protocol is added if missing
 */
function normalizeHostUrl(host: string): string {
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host
    }
    if (host.includes(':')) {
        return `http://${host}` // Has port, assume http
    }
    return `https://${host}` // No port, assume https
}

export function RepoBrowser({ tabId }: RepoBrowserProps) {
    const tab = useAppState((s) => s.tabs.find((t) => t.id === tabId))
    const updateTab = useAppState((s) => s.updateTab)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [errorDetails, setErrorDetails] = useState<any>(null)
    const [optionsInfo, setOptionsInfo] = useState<OptionsInfo>({})
    // Hook rendering delegated to HookRenderer component
    // Server version and git pull state
    const [serverHeadCommit, setServerHeadCommit] = useState<string | null>(null)
    const [isPulling, setIsPulling] = useState(false)
    const [pullResult, setPullResult] = useState<any>(null)
    const [showUpdateModal, setShowUpdateModal] = useState(false)
    // Client is now dumb: search and navigation UI are moved into repo layout
    // Keep minimal state only for hook/file rendering

    // Get server version from OPTIONS response (already includes branch commit hash)
    const fetchServerVersion = async (opts: OptionsInfo) => {
        if (!opts?.repos?.[0]?.branches) return
        try {
            const currentBranch = tab?.currentBranch || 'main'
            const commitHash = opts.repos[0].branches[currentBranch]
            if (commitHash) {
                setServerHeadCommit(commitHash.substring(0, 7)) // Short hash
            }
        } catch (e) {
            console.debug('[RepoBrowser] Could not extract commit hash from OPTIONS:', e)
        }
    }

    // Handle git pull from server
    const handleGitPull = async () => {
        if (!tab || !tab.host) return
        setIsPulling(true)
        try {
            const baseUrl = normalizeHostUrl(tab.host)
            const resp = await fetch(`${baseUrl}/git-pull`, { method: 'POST' })
            const result = await resp.json()
            setPullResult(result)

            if (result.updated) {
                setShowUpdateModal(true)
            }
        } catch (e) {
            console.error('[RepoBrowser] Git pull failed:', e)
            setPullResult({
                success: false,
                message: 'Failed to pull from server',
                error: e instanceof Error ? e.message : String(e),
            })
        } finally {
            setIsPulling(false)
        }
    }

    // Refresh page after update
    const handleRefresh = () => {
        window.location.reload()
    }

    useEffect(() => {
        if (!tab || !tab.host) return
            ;
        (async () => {
            try {
                const opts = await loadOptions()
                await loadContent(opts)
                // Extract server version from OPTIONS response
                if (opts) {
                    await fetchServerVersion(opts)
                }
            } catch (e) {
                console.error('[RepoBrowser] init failed:', e)
            }
        })()
    }, [tab?.host, tab?.path])

    const loadOptions = async (): Promise<OptionsInfo | null> => {
        if (!tab || !tab.host) return null
        try {
            const baseUrl = normalizeHostUrl(tab.host)
            const diagnostics: Record<string, any> = { phase: 'options', url: `${baseUrl}/` }

            // Attempt OPTIONS discovery first
            const resp = await fetch(`${baseUrl}/`, { method: 'OPTIONS' })
            diagnostics.options = {
                status: resp.status,
                ok: resp.ok,
                headers: {
                    'content-type': resp.headers.get('content-type'),
                    'content-length': resp.headers.get('content-length'),
                },
            }

            let options: OptionsInfo | null = null
            let parsedFrom: 'OPTIONS' | null = null

            try {
                // Some reverse proxies return 200 with empty body for OPTIONS
                const text = await resp.text()
                diagnostics.optionsBodyLength = text?.length || 0
                if (text && text.trim().length > 0) {
                    options = JSON.parse(text)
                    parsedFrom = 'OPTIONS'
                }
            } catch (parseErr) {
                diagnostics.optionsParseError = parseErr instanceof Error ? parseErr.message : String(parseErr)
            }

            if (!options) {
                const message = `Repository discovery failed: OPTIONS returned ${diagnostics.options?.status} with body length ${diagnostics.optionsBodyLength}. The server must implement OPTIONS / to return capabilities and client hooks.`
                setError(message)
                setErrorDetails(diagnostics)
                console.error('[RepoBrowser] Discovery failed. Diagnostics:', diagnostics)
                return null
            }

            // If OPTIONS returned a valid payload but contains no repositories, surface a clearer error
            if (Array.isArray(options.repos) && options.repos.length === 0) {
                setError('Repository discovery did not return any repos. OPTIONS responded successfully but the repos list is empty. See details for diagnostics.')
                setErrorDetails({ phase: 'render', reason: 'no-repos', optionsInfo: options, diagnostics })
                console.error('[RepoBrowser] No repos returned in OPTIONS payload:', { options, diagnostics })
                return null
            }

            setOptionsInfo(options)
            diagnostics.parsedFrom = parsedFrom
            const branches = options.repos?.[0]?.branches ? Object.keys(options.repos[0].branches) : undefined
            updateTab(tab.id, (t) => ({
                ...t,
                branches,
                reposList: options.repos?.map((r) => r.name),
            }))
            if (!options?.client?.hooks?.get?.path) {
                console.error('[RepoBrowser] Discovery missing client hook paths', { options, diagnostics })
            }
            return options
        } catch (err) {
            console.error('Failed to load options:', err)
            setError('Failed to load repository OPTIONS')
            setErrorDetails({ phase: 'options', reason: (err as any)?.message || String(err) })
            return null
        }
    }

    const loadContent = async (opts?: OptionsInfo | null) => {
        if (!tab || !tab.host) return

        setLoading(true)
        setError(null)

        try {
            // If we don't have options, abort with a clearer error and diagnostics
            const info = opts || optionsInfo
            if (!info || !info.client) {
                setError('Repository discovery did not return client hooks. OPTIONS may be blocked or empty; attempted GET fallback. See details for diagnostics.')
                setErrorDetails({ phase: 'render', reason: 'no-options', optionsInfo })
                return
            }

            // HookRenderer will be rendered by this component; nothing else to do here.
            // loadContent only verifies options and updates auxiliary state
            return
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load content')
            setErrorDetails(err)
        } finally {
            setLoading(false)
        }
    }

    // navigation is handled via helpers passed into hooks; RepoBrowser itself doesn't navigate directly here

    // Client no longer owns search or direct content rendering; repo hook must render everything.



    /**
     * Resolves paths within /template context
     * Handles both relative paths (./foo, ../foo) and absolute paths (/hooks/foo)
     * Returns properly formatted URL without double slashes
     */
    // Module path resolution and hook helpers are provided inside HookRenderer now.



    if (!tab) {
        return <div className="repo-browser">Tab not found</div>
    }

    const repoBaseUrl = useMemo(() => tab?.host ? normalizeHostUrl(tab.host) : '/', [tab?.host])
    const providerResolve = useMemo(() => (p: string) => {
        const path = p.startsWith('/') ? p.slice(1) : p
        return new URL(path, repoBaseUrl).toString()
    }, [repoBaseUrl])
    const providerFetch = useMemo(() => (input: any, init?: RequestInit) => {
        if (typeof input === 'string') {
            const isAbs = /^(https?:)?\/\//i.test(input)
            return fetch(isAbs ? input : providerResolve(input), init)
        }
        if (input instanceof URL) return fetch(input.toString(), init)
        return fetch(input, init)
    }, [providerResolve])

    const providerFetchJson = useMemo(() => async (path: string, init?: RequestInit) => {
        const url = providerResolve(path)
        const resp = await fetch(url, init)
        const ct = (resp.headers.get('content-type') || '').toLowerCase()
        const text = await resp.text()
        const mkErr = (message: string) => {
            const e: any = new Error(message)
            e.name = 'RepoFetchJsonError'
            e.details = { url, status: resp.status, ok: resp.ok, contentType: ct, sample: text.slice(0, 256) }
            return e
        }
        if (!resp.ok) throw mkErr(`HTTP ${resp.status} while fetching JSON: ${url}`)
        if (!ct.includes('application/json')) {
            // Heuristic: many proxies return index.html (text/html)
            if (text.trim().startsWith('<')) {
                throw mkErr('Expected JSON but received HTML (likely SPA fallback)')
            }
        }
        try {
            return JSON.parse(text)
        } catch (err) {
            throw mkErr(`Failed to parse JSON: ${(err as any)?.message || String(err)}`)
        }
    }, [providerResolve])

    return (
        <RepoFetchProvider value={{
            baseUrl: repoBaseUrl,
            resolve: providerResolve,
            fetch: providerFetch,
            fetchJson: providerFetchJson
        }}>
            <TSDiv className="flex flex-col h-full">
                <ErrorBoundary>
                    <TSDiv className="flex-1 overflow-y-auto">

                        {loading &&
                            <TSDiv className="flex items-center justify-center h-full">Loading...</TSDiv>}

                        {error && (
                            <TSDiv
                                className="p-8 bg-[var(--bg-error)] border border-[var(--border-error)] rounded-lg text-[var(--text-error)]">
                                <TSDiv tag="h3" className="mt-0">Error</TSDiv>
                                <TSDiv tag="p" className="font-semibold">{error}</TSDiv>

                                {errorDetails && (
                                    <TSDiv className="mt-4 space-y-3 text-sm">
                                        {/* Show hook path and HTTP request info */}
                                        {errorDetails.kind && (
                                            <TSDiv className="bg-red-600/10 p-3 rounded border/50">
                                                <TSDiv className="font-mono text-xs space-y-1">
                                                    <TSDiv><TSDiv tag="strong">Hook Type:</TSDiv> {errorDetails.kind}</TSDiv>
                                                    {errorDetails.hookUrl && (
                                                        <TSDiv className="break-all"><TSDiv tag="strong">GET URL:</TSDiv> <TSDiv tag="code"
                                                            className="bg-black/20 px-1 py-0.5 rounded">{errorDetails.hookUrl}</TSDiv>
                                                        </TSDiv>
                                                    )}
                                                    {errorDetails.fetch && (
                                                        <>
                                                            <TSDiv><TSDiv tag="strong">HTTP
                                                                Status:</TSDiv> {errorDetails.fetch.status} {errorDetails.fetch.ok ? '✓' : '✗'}
                                                            </TSDiv>
                                                            <TSDiv>
                                                                <TSDiv tag="strong">Content-Type:</TSDiv> {errorDetails.fetch.contentType || 'not specified'}
                                                            </TSDiv>
                                                        </>
                                                    )}
                                                    {errorDetails.codeLength && (
                                                        <TSDiv><TSDiv tag="strong">Code
                                                            Length:</TSDiv> {errorDetails.codeLength} bytes</TSDiv>
                                                    )}
                                                </TSDiv>
                                            </TSDiv>
                                        )}

                                        {/* Show JSX transpilation errors (from transpileCode failure) */}
                                        {(errorDetails.reason === 'transpile-failed' || errorDetails.jsxError) && (
                                            <TSDiv className="bg-red-600/10 p-3 rounded border/50 space-y-2">
                                                <TSDiv className="font-semibold text-xs">
                                                    {errorDetails.isWasmNotLoaded ? '🔌 WASM Transpiler Not Available' : '❌ JSX Transpilation Failed'}
                                                </TSDiv>

                                                {errorDetails.isWasmNotLoaded && (
                                                    <TSDiv className="text-xs bg-red-900/20 border/30 rounded p-2 space-y-1">
                                                        <TSDiv tag="p" className="font-semibold">The JSX transpiler (WASM) is not available</TSDiv>
                                                        <TSDiv tag="p">This usually means:</TSDiv>
                                                        <TSDiv tag="ul" className="list-disc list-inside ml-2 space-y-1">
                                                            <TSDiv tag="li">The app didn't fully load when you started browsing</TSDiv>
                                                            <TSDiv tag="li">Your browser blocked WASM module loading</TSDiv>
                                                            <TSDiv tag="li">Network issue prevented transpiler from downloading</TSDiv>
                                                        </TSDiv>
                                                        <TSDiv tag="p" className="mt-2"><TSDiv tag="strong">Fix:</TSDiv> Refresh the page and try again. Check browser console (F12) for errors.</TSDiv>
                                                    </TSDiv>
                                                )}

                                                {!errorDetails.isWasmNotLoaded && (
                                                    <TSDiv className="text-xs bg-red-900/20 border/30 rounded p-2 space-y-1">
                                                        <TSDiv tag="p" className="font-semibold">Invalid JSX syntax detected</TSDiv>
                                                        <TSDiv tag="p">The transpiler encountered syntax it couldn't convert. Check:</TSDiv>
                                                        <TSDiv tag="ul" className="list-disc list-inside ml-2 space-y-1">
                                                            <TSDiv tag="li">All JSX tags are properly closed</TSDiv>
                                                            <TSDiv tag="li">Attributes are correctly formatted</TSDiv>
                                                            <TSDiv tag="li">No special characters in tag names</TSDiv>
                                                        </TSDiv>
                                                    </TSDiv>
                                                )}

                                                <TSDiv className="font-mono text-xs bg-black/20 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                                                    {typeof errorDetails.jsxError === 'string' ? errorDetails.jsxError : (errorDetails.jsxError?.message || JSON.stringify(errorDetails.jsxError, null, 2))}
                                                </TSDiv>
                                            </TSDiv>
                                        )}

                                        {/* Show execution errors */}
                                        {errorDetails.reason === 'execution-failed' && errorDetails.error && (
                                            <TSDiv className={`p-3 rounded border ${errorDetails.isJsxSyntaxError ? 'bg-orange-600/10 border-orange-400/50' : 'bg-red-600/10/50'}`}>
                                                <TSDiv className="font-semibold text-xs mb-3">
                                                    {errorDetails.isJsxSyntaxError ? '⚠️ JSX Transpilation Issue' : '❌ Execution Error'}
                                                </TSDiv>

                                                {/* For JSX syntax errors, provide detailed help */}
                                                {errorDetails.isJsxSyntaxError && (
                                                    <TSDiv className="space-y-2 mb-3">
                                                        <TSDiv className="text-xs bg-orange-900/20 border border-orange-400/30 rounded p-2">
                                                            <TSDiv tag="p" className="font-semibold mb-2">What went wrong:</TSDiv>
                                                            <TSDiv tag="p" className="mb-2">The code contains JSX syntax (<TSDiv tag="code">&lt;</TSDiv> character), but it wasn't converted to regular JavaScript before execution.</TSDiv>
                                                        </TSDiv>
                                                        <TSDiv className="text-xs bg-blue-900/20 border border-blue-400/30 rounded p-2">
                                                            <TSDiv tag="p" className="font-semibold mb-2">Common causes:</TSDiv>
                                                            <TSDiv tag="ul" className="list-disc list-inside space-y-1">
                                                                <TSDiv tag="li"><TSDiv tag="strong">WASM transpiler failed to load:</TSDiv> Check browser console for WASM errors</TSDiv>
                                                                <TSDiv tag="li"><TSDiv tag="strong">Invalid JSX syntax:</TSDiv> Ensure JSX tags are properly closed (e.g., <TSDiv tag="code">&lt;div&gt;content&lt;/div&gt;</TSDiv>)</TSDiv>
                                                                <TSDiv tag="li"><TSDiv tag="strong">Missing React import:</TSDiv> Add <TSDiv tag="code">const h = React.createElement</TSDiv> or equivalent</TSDiv>
                                                                <TSDiv tag="li"><TSDiv tag="strong">Wrong file type:</TSDiv> Use .jsx or .tsx extension, or add <TSDiv tag="code">// @use-jsx</TSDiv> comment at the top</TSDiv>
                                                            </TSDiv>
                                                        </TSDiv>
                                                        <TSDiv className="text-xs bg-green-900/20 border rounded p-2">
                                                            <TSDiv tag="p" className="font-semibold mb-2">How to fix:</TSDiv>
                                                            <TSDiv tag="ul" className="list-disc list-inside space-y-1">
                                                                <TSDiv tag="li">Verify the hook file has .jsx or .tsx extension</TSDiv>
                                                                <TSDiv tag="li">Check the browser's developer console (F12) for detailed transpiler errors</TSDiv>
                                                                <TSDiv tag="li">Ensure JSX is properly formatted: <TSDiv tag="code">&lt;ComponentName prop="value"&gt;</TSDiv></TSDiv>
                                                                <TSDiv tag="li">For debugging, try uploading a simple JSX file first: <TSDiv tag="code">&lt;div&gt;Hello&lt;/div&gt;</TSDiv></TSDiv>
                                                            </TSDiv>
                                                        </TSDiv>
                                                    </TSDiv>
                                                )}

                                                <TSDiv className="font-mono text-xs mb-2">
                                                    <TSDiv tag="strong">Error Message:</TSDiv> {errorDetails.error}
                                                </TSDiv>
                                                {errorDetails.diagnosticMsg && (
                                                    <TSDiv className="font-mono text-xs mb-2 bg-black/20 p-2 rounded whitespace-pre-wrap">
                                                        <TSDiv tag="strong">Diagnostic:</TSDiv>
                                                        <TSDiv className="mt-1">
                                                            {errorDetails.diagnosticMsg}
                                                        </TSDiv>
                                                    </TSDiv>
                                                )}
                                                {errorDetails.transpilerVersion && (
                                                    <TSDiv className="font-mono text-xs mb-2 text-blue-100">
                                                        <TSDiv tag="strong">Hook transpiler:</TSDiv> v{errorDetails.transpilerVersion}
                                                    </TSDiv>
                                                )}
                                                {errorDetails.transpilerDiagnostic && (
                                                    <TSDiv className="font-mono text-xs bg-black/30 rounded p-2 mb-2 break-words">
                                                        <TSDiv tag="strong">Transpiler error:</TSDiv>
                                                        <TSDiv className="mt-1 text-[11px] whitespace-pre-wrap">
                                                            {errorDetails.transpilerDiagnostic}
                                                        </TSDiv>
                                                    </TSDiv>
                                                )}
                                                {errorDetails.finalCodeSnippet && (
                                                    <TSDiv tag="details" className="text-xs bg-black/10 border border-black/20 rounded p-2 mb-2">
                                                        <TSDiv tag="summary" className="cursor-pointer">Transpiled preview (first 500 chars)</TSDiv>
                                                        <TSDiv tag="pre" className="overflow-auto max-h-32 text-[11px] mt-1 whitespace-pre-wrap">{errorDetails.finalCodeSnippet}</TSDiv>
                                                    </TSDiv>
                                                )}
                                                {errorDetails.transpiledCodeSnippet && (
                                                    <TSDiv tag="details" className="text-xs bg-black/10 border border-black/20 rounded p-2 mb-2">
                                                        <TSDiv tag="summary" className="cursor-pointer">Last transpiler output (window.__lastTranspiledCode)</TSDiv>
                                                        <TSDiv tag="pre" className="overflow-auto max-h-32 text-[11px] mt-1 whitespace-pre-wrap">{errorDetails.transpiledCodeSnippet}</TSDiv>
                                                    </TSDiv>
                                                )}
                                                {errorDetails.stack && Array.isArray(errorDetails.stack) && (
                                                    <TSDiv tag="details" className="text-xs">
                                                        <TSDiv tag="summary" className="cursor-pointer hover:underline opacity-70 mb-1">Stack trace</TSDiv>
                                                        <TSDiv tag="pre"
                                                            className="overflow-auto max-h-24 whitespace-pre-wrap opacity-60 bg-black/20 p-2 rounded">
                                                            {errorDetails.stack.join('\n')}
                                                        </TSDiv>
                                                    </TSDiv>
                                                )}
                                            </TSDiv>
                                        )}

                                        {/* Repo fetch JSON mismatch diagnostics */}
                                        {errorDetails.fetchJson && (
                                            <TSDiv className="bg-yellow-600/10 p-3 rounded border border-yellow-400/50">
                                                <TSDiv className="font-semibold text-xs mb-2">Expected JSON but got HTML
                                                    (likely SPA fallback)
                                                </TSDiv>
                                                <TSDiv className="text-xs space-y-1 font-mono">
                                                    <TSDiv><TSDiv tag="strong">URL:</TSDiv> {errorDetails.fetchJson.url}</TSDiv>
                                                    <TSDiv>
                                                        <TSDiv tag="strong">Status:</TSDiv> {String(errorDetails.fetchJson.status)} ({errorDetails.fetchJson.ok ? 'ok' : 'error'})
                                                    </TSDiv>
                                                    <TSDiv>
                                                        <TSDiv tag="strong">Content-Type:</TSDiv> {errorDetails.fetchJson.contentType || 'n/a'}
                                                    </TSDiv>
                                                    {errorDetails.fetchJson.sample && (
                                                        <TSDiv tag="details" className="mt-2">
                                                            <TSDiv tag="summary" className="cursor-pointer">Response sample
                                                            </TSDiv>
                                                            <TSDiv tag="pre"
                                                                className="mt-1 max-h-40 overflow-auto bg-black/20 p-2 rounded">{errorDetails.fetchJson.sample}</TSDiv>
                                                        </TSDiv>
                                                    )}
                                                </TSDiv>
                                                <TSDiv className="text-xs mt-2 opacity-80">
                                                    Tips: Ensure the file exists in the repository, and that the relay
                                                    server serves it at the path above. If nginx SPA fallback is
                                                    enabled, upstream 404 may be converted into 200 HTML.
                                                </TSDiv>
                                            </TSDiv>
                                        )}

                                        {/* Show general diagnostics */}
                                        {errorDetails.reason && (
                                            <TSDiv className="text-xs opacity-80">
                                                <TSDiv tag="strong">Phase:</TSDiv> {errorDetails.phase || 'unknown'} | <TSDiv tag="strong">Reason:</TSDiv> {errorDetails.reason}
                                            </TSDiv>
                                        )}
                                    </TSDiv>
                                )}

                                <TSDiv className="mt-4 text-sm opacity-80">
                                    <TSDiv className="font-semibold mb-2">Troubleshooting:</TSDiv>
                                    <TSDiv tag="ul" className="list-disc pl-5 space-y-1">
                                        <TSDiv tag="li">Verify <TSDiv tag="code">.relay.yaml</TSDiv> contains <TSDiv tag="code">client.hooks.get.path</TSDiv> and <TSDiv tag="code">client.hooks.query.path</TSDiv>.
                                        </TSDiv>
                                        <TSDiv tag="li">Ensure the hook module exports a default function: <TSDiv tag="code">export default
                                            async
                                            function(ctx) {'{'} return ... {'}'} </TSDiv></TSDiv>
                                        <TSDiv tag="li">If using JSX, add a top-of-file comment <TSDiv tag="code">// @use-jsx</TSDiv> or
                                            use <TSDiv tag="code">.jsx</TSDiv>/<TSDiv tag="code">.tsx</TSDiv> extension.
                                        </TSDiv>
                                        <TSDiv tag="li">Check browser console (F12) for detailed logs starting
                                            with <TSDiv tag="code">[Hook]</TSDiv> or <TSDiv tag="code">[RepoBrowser]</TSDiv>.
                                        </TSDiv>
                                    </TSDiv>
                                </TSDiv>

                                {/* Show full JSON for debugging */}
                                <TSDiv tag="details" className="mt-4 text-xs opacity-70">
                                    <TSDiv tag="summary" className="cursor-pointer font-semibold">Full Diagnostics (JSON)</TSDiv>
                                    <TSDiv tag="pre"
                                        className="mt-2 overflow-auto max-h-64 whitespace-pre-wrap bg-black/20 p-2 rounded">
                                        {JSON.stringify(errorDetails, null, 2)}
                                    </TSDiv>
                                </TSDiv>

                                <TSDiv
                                    tag="button"
                                    onClick={loadContent}
                                    className="px-4 py-2 bg-red-600 text-white border-none rounded cursor-pointer mt-4 hover:bg-red-700">Try
                                    Again
                                </TSDiv>
                            </TSDiv>
                        )}

                        {!loading && (
                            tab?.host ? <HookRenderer host={tab.host} /> : null
                        )}
                        {/* No placeholders: if the hook didn't render and there's no error, render nothing */}
                    </TSDiv>
                </ErrorBoundary>

                {/* Footer with version and git pull button */}
                <TSDiv
                    className="border-t bg-[var(--bg-secondary)] px-4 py-3 flex items-center justify-between">
                    <TSDiv className="text-sm text-[var(--text-secondary)]">
                        {serverHeadCommit ? (
                            <TSDiv tag="span">
                                Version: <TSDiv tag="code"
                                    className="bg-[var(--bg-code)] px-2 py-1 rounded text-xs">{serverHeadCommit}</TSDiv>
                            </TSDiv>
                        ) : (
                            <TSDiv tag="span">Version: loading...</TSDiv>
                        )}
                    </TSDiv>
                    <TSDiv
                        tag="button"
                        onClick={handleGitPull}
                        disabled={isPulling}
                        className={`px-4 py-2 rounded text-sm font-medium transition ${isPulling
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                            }`}
                        title={isPulling ? 'Pulling updates...' : 'Pull latest updates from origin'}
                    >
                        {isPulling ? '⟳ Pulling...' : `⟳ Pull${serverHeadCommit ? ` (${serverHeadCommit})` : ''}`}
                    </TSDiv>
                </TSDiv>

                {/* Update modal */}
                {showUpdateModal && (
                    <TSDiv className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <TSDiv className="bg-[var(--bg-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                            <TSDiv tag="h2" className="text-xl font-bold mb-4 text-[var(--text)]">
                                Update Available
                            </TSDiv>
                            {pullResult && (
                                <TSDiv className="space-y-3 text-[var(--text)]">
                                    <TSDiv tag="p">
                                        <TSDiv tag="strong">Status:</TSDiv> {pullResult.success ? '✓ Success' : '✗ Failed'}
                                    </TSDiv>
                                    <TSDiv tag="p">
                                        <TSDiv tag="strong">Message:</TSDiv> {pullResult.message}
                                    </TSDiv>
                                    {pullResult.before_commit && (
                                        <TSDiv tag="p">
                                            <TSDiv tag="strong">Before:</TSDiv>{' '}
                                            <TSDiv tag="code" className="bg-[var(--bg-code)] px-2 py-1 rounded text-xs">
                                                {pullResult.before_commit.substring(0, 7)}
                                            </TSDiv>
                                        </TSDiv>
                                    )}
                                    {pullResult.after_commit && (
                                        <TSDiv tag="p">
                                            <TSDiv tag="strong">After:</TSDiv>{' '}
                                            <TSDiv tag="code" className="bg-[var(--bg-code)] px-2 py-1 rounded text-xs">
                                                {pullResult.after_commit.substring(0, 7)}
                                            </TSDiv>
                                        </TSDiv>
                                    )}
                                </TSDiv>
                            )}
                            <TSDiv className="flex gap-3 mt-6">
                                <TSDiv
                                    tag="button"
                                    onClick={() => setShowUpdateModal(false)}
                                    className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] text-[var(--text)] rounded transition"
                                >
                                    Close
                                </TSDiv>
                                <TSDiv
                                    tag="button"
                                    onClick={handleRefresh}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium"
                                >
                                    Refresh
                                </TSDiv>
                            </TSDiv>
                        </TSDiv>
                    </TSDiv>
                )}
            </TSDiv>
        </RepoFetchProvider>
    )
}

/**
 * Build a URL to fetch content from a peer
 * (imported from @relay/shared for consistency with React Native client)
 */
