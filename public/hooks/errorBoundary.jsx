import React from 'react'

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo)
        this.setState({ errorInfo })
    }

    // Extract source code context for transpile errors
    getSourceContext(error) {
        const message = error?.message || ''

        // Check if this is a transpile error with position info
        const transpileMatch = message.match(/position (\d+)/)
        if (!transpileMatch) {
            return null
        }

        const position = parseInt(transpileMatch[1])

        // Try to get the original source code
        const errorSource = globalThis.__lastTranspileErrorSource
        if (!errorSource || !errorSource.code) {
            return null
        }

        const { code, filename } = errorSource

        // Calculate line and column from position
        let line = 1
        let column = 1
        let lastLineStart = 0

        for (let i = 0; i < position && i < code.length; i++) {
            if (code[i] === '\n') {
                line++
                column = 1
                lastLineStart = i + 1
            } else {
                column++
            }
        }

        // Extract surrounding lines for context (3 before, current, 3 after)
        const lines = code.split('\n')
        const contextStart = Math.max(0, line - 4)
        const contextEnd = Math.min(lines.length, line + 3)
        const contextLines = lines.slice(contextStart, contextEnd)

        return {
            filename,
            position,
            line,
            column,
            contextLines,
            contextStart: contextStart + 1, // 1-indexed for display
            errorLine: line
        }
    }

    // Extract transpiled code context
    getTranspiledContext(error) {
        const message = error?.message || ''

        // Check if this is a transpile error with position info
        const transpileMatch = message.match(/position (\d+)/)
        if (!transpileMatch) {
            return null
        }

        const position = parseInt(transpileMatch[1])

        // Try to get the transpiled code (actual output only)
        const transpiledCode = globalThis.__lastTranspiledCode
        if (!transpiledCode) {
            return null
        }
        // If the "transpiled" code equals the original source, do not show it
        const originalSource = globalThis.__lastTranspileErrorSource?.code
        if (originalSource && transpiledCode === originalSource) {
            return null
        }

        // Calculate line and column from position
        let line = 1
        let column = 1

        for (let i = 0; i < position && i < transpiledCode.length; i++) {
            if (transpiledCode[i] === '\n') {
                line++
                column = 1
            } else {
                column++
            }
        }

        // Extract surrounding lines for context
        const lines = transpiledCode.split('\n')
        const contextStart = Math.max(0, line - 4)
        const contextEnd = Math.min(lines.length, line + 3)
        const contextLines = lines.slice(contextStart, contextEnd)

        return {
            position,
            line,
            column,
            contextLines,
            contextStart: contextStart + 1,
            errorLine: line
        }
    }

    // Parse error message to extract useful info
    parseErrorMessage(error) {
        const message = error?.message || String(error)

        // Check for transpile error
        if (message.includes('TranspileError')) {
            const match = message.match(/TranspileError: (.*?): (.*?) \(v(.*?)\)/)
            if (match) {
                return {
                    type: 'transpile',
                    file: match[1],
                    description: match[2],
                    version: match[3]
                }
            }
        }

        // Check for syntax error
        if (message.includes('SyntaxError') || message.includes('Unexpected')) {
            return {
                type: 'syntax',
                description: message
            }
        }

        // Generic error
        return {
            type: 'runtime',
            description: message
        }
    }

    render() {
        if (this.state.hasError) {
            const errorDetails = this.parseErrorMessage(this.state.error)
            const errorMessage = this.state.error?.message || String(this.state.error || '')
            const sourceContext = this.getSourceContext(this.state.error)
            const transpiledContext = this.getTranspiledContext(this.state.error)
            const messageHasPosition = /position (\d+)/.test(errorMessage)
            const lastTranspiledCode = globalThis.__lastTranspiledCode
            const originalSource = globalThis.__lastTranspileErrorSource?.code
            let transpiledUnavailableReason = null
            if (messageHasPosition && !transpiledContext) {
                if (!lastTranspiledCode) {
                    transpiledUnavailableReason = 'Transpiler produced no output for this error (no transpiled code to display).'
                } else if (originalSource && lastTranspiledCode === originalSource) {
                    transpiledUnavailableReason = 'Transpiled output matched the original source; hidden to avoid duplication.'
                } else {
                    transpiledUnavailableReason = 'Transpiled code context is unavailable for this error.'
                }
            }

            return (
                <div className="p-6 max-w-4xl mx-auto">
                    <div className="bg-red-50 border-2 border-red-400 rounded-lg overflow-hidden">
                        {/* Header */}
                        <div className="bg-red-500 text-white px-4 py-3">
                            <h2 className="font-bold text-xl m-0">
                                {errorDetails.type === 'transpile' && '⚠️ Transpile Error'}
                                {errorDetails.type === 'syntax' && '⚠️ Syntax Error'}
                                {errorDetails.type === 'runtime' && '❌ Component Error'}
                            </h2>
                        </div>

                        {/* Error Details */}
                        <div className="p-4 space-y-4">
                            {/* File Info */}
                            {errorDetails.file && (
                                <div className="bg-white border border-red-200 rounded p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-1">File:</div>
                                    <div className="font-mono text-sm font-semibold text-red-700">{errorDetails.file}</div>
                                </div>
                            )}

                            {/* Error Message */}
                            <div className="bg-white border border-red-200 rounded p-3">
                                <div className="text-xs font-semibold text-gray-600 mb-2">Error:</div>
                                <div className="text-sm text-red-800 font-medium break-words">
                                    {errorDetails.description}
                                </div>
                            </div>

                            {/* Source Context */}
                            {sourceContext && (
                                <div className="bg-gray-900 border border-gray-700 rounded p-3">
                                    <div className="text-xs font-semibold text-gray-300 mb-2">
                                        Original Source (Line {sourceContext.line}, Column {sourceContext.column}):
                                    </div>
                                    <div className="font-mono text-xs bg-black p-3 rounded overflow-x-auto">
                                        {sourceContext.contextLines.map((codeLine, idx) => {
                                            const lineNumber = sourceContext.contextStart + idx
                                            const isErrorLine = lineNumber === sourceContext.errorLine
                                            return (
                                                <div
                                                    key={idx}
                                                    className={isErrorLine ? 'bg-red-900/50 -mx-1 px-1' : ''}
                                                >
                                                    <span className={`inline-block w-10 text-right pr-3 select-none ${isErrorLine ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                                        {lineNumber}
                                                    </span>
                                                    <span className={isErrorLine ? 'text-red-200' : 'text-gray-300'}>
                                                        {codeLine || ' '}
                                                    </span>
                                                    {isErrorLine && (
                                                        <div className="text-red-400 ml-10 -mt-1">
                                                            {' '.repeat(sourceContext.column - 1)}↑ Error may originate here
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-400">
                                        File: <span className="font-mono text-gray-300">{sourceContext.filename}</span>
                                    </div>
                                </div>
                            )}

                            {/* Transpiled Code Context */}
                            {transpiledContext && (
                                <div className="bg-gray-900 border border-yellow-700 rounded p-3">
                                    <div className="text-xs font-semibold text-yellow-300 mb-2">
                                        Transpiled Code (Position {transpiledContext.position}, Column ?):
                                    </div>
                                    <div className="font-mono text-xs bg-black p-3 rounded overflow-x-auto">
                                        {transpiledContext.contextLines.map((codeLine, idx) => {
                                            const lineNumber = transpiledContext.contextStart + idx
                                            const isErrorLine = lineNumber === transpiledContext.errorLine
                                            return (
                                                <div
                                                    key={idx}
                                                    className={isErrorLine ? 'bg-yellow-900/50 -mx-1 px-1' : ''}
                                                >
                                                    <span className={`inline-block w-10 text-right pr-3 select-none ${isErrorLine ? 'text-yellow-400 font-bold' : 'text-gray-500'}`}>
                                                        {lineNumber}
                                                    </span>
                                                    <span className={isErrorLine ? 'text-yellow-200' : 'text-gray-300'}>
                                                        {codeLine || ' '}
                                                    </span>
                                                    {isErrorLine && (
                                                        <div className="text-yellow-400 ml-10 -mt-1">
                                                            {' '.repeat(transpiledContext.column - 1)}↑ Error detected here
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-2 text-xs text-yellow-300">
                                        This is the code after JSX transformation. The error was detected at this position.
                                    </div>
                                </div>
                            )}
                            {!transpiledContext && transpiledUnavailableReason && (
                                <div className="bg-gray-900 border border-yellow-700 rounded p-3 text-xs text-yellow-200">
                                    <div className="font-semibold text-yellow-300 mb-1">Transpiled Code Unavailable</div>
                                    <div>{transpiledUnavailableReason}</div>
                                </div>
                            )}

                            {/* Help Text */}
                            {errorDetails.type === 'transpile' && (
                                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                    <div className="text-xs font-semibold text-blue-900 mb-2">💡 Common Causes:</div>
                                    <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                                        <li>TypeScript syntax in .jsx file (use .tsx or remove TypeScript syntax)</li>
                                        <li>Invalid JSX syntax (unclosed tags, improper nesting)</li>
                                        <li>ES6+ features not supported by transpiler</li>
                                        <li>Special characters or encoding issues</li>
                                    </ul>
                                </div>
                            )}

                            {/* Stack Trace */}
                            {this.state.error?.stack && (
                                <details className="bg-gray-50 border border-gray-300 rounded">
                                    <summary className="px-3 py-2 cursor-pointer font-semibold text-sm text-gray-700 hover:bg-gray-100">
                                        Stack Trace (click to expand)
                                    </summary>
                                    <pre className="px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
                                        {this.state.error.stack}
                                    </pre>
                                </details>
                            )}

                            {/* Debug Info */}
                            <details className="bg-gray-50 border border-gray-300 rounded">
                                <summary className="px-3 py-2 cursor-pointer font-semibold text-sm text-gray-700 hover:bg-gray-100">
                                    Debug Info (click to expand)
                                </summary>
                                <div className="px-3 py-2 text-xs space-y-2">
                                    {errorDetails.version && (
                                        <div>
                                            <span className="font-semibold">Transpiler Version:</span>{' '}
                                            <span className="font-mono">{errorDetails.version}</span>
                                        </div>
                                    )}
                                    <div>
                                        <span className="font-semibold">Error Type:</span>{' '}
                                        <span className="font-mono">{errorDetails.type}</span>
                                    </div>
                                    {globalThis.__lastTranspileError && (
                                        <div>
                                            <span className="font-semibold">Last Transpile Error:</span>
                                            <pre className="mt-1 bg-white p-2 rounded border font-mono text-xs overflow-x-auto">
                                                {globalThis.__lastTranspileError}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
