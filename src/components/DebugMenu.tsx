import {useState} from 'react'
import {TSDiv} from './TSDiv'

export function DebugMenu() {
    const [isOpen, setIsOpen] = useState(false)
    const [showTextarea, setShowTextarea] = useState(false)
    const [copyStatus, setCopyStatus] = useState<string | null>(null)

    const copyHtmlToClipboard = async () => {
        try {
            const htmlString = document.documentElement.outerHTML

            // Try to use clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(htmlString)
                setCopyStatus('✓ Copied to clipboard!')
                setTimeout(() => setCopyStatus(null), 2000)
                setShowTextarea(false)
            } else {
                // Fallback: show textarea
                setShowTextarea(true)
                setCopyStatus(null)
            }
        } catch (err) {
            console.error('Failed to copy HTML:', err)
            setShowTextarea(true)
            setCopyStatus(null)
        }
    }

    return (
        <TSDiv className="fixed top-4 right-4 z-50">
            {/* Toggle Button */}
            <TSDiv
                tag="button"
                onClick={() => setIsOpen(!isOpen)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm font-semibold shadow-lg transition-colors"
                title="Debug menu"
            >
                🐛 Debug
            </TSDiv>

            {/* Menu */}
            {isOpen && (
                <TSDiv className="absolute top-12 right-0 border rounded shadow-xl p-3 w-64 text-white text-sm">
                    <TSDiv className="space-y-2">
                        <TSDiv
                            tag="button"
                            onClick={copyHtmlToClipboard}
                            className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-left transition-colors"
                        >
                            📋 Copy HTML to Clipboard
                        </TSDiv>

                        {copyStatus && (
                            <TSDiv className="bg-green-700 px-3 py-2 rounded text-center text-xs">
                                {copyStatus}
                            </TSDiv>
                        )}
                    </TSDiv>
                </TSDiv>
            )}

            {/* Textarea Fallback Modal */}
            {showTextarea && (
                <TSDiv className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <TSDiv
                        className="bg-gray-800 rounded-lg shadow-2xl p-6 max-w-2xl max-h-96 w-full mx-4 flex flex-col border">
                        <TSDiv tag="h2" className="text-white font-bold text-lg mb-3">Copy HTML</TSDiv>
                        <TSDiv tag="p" className="text-gray-300 text-xs mb-3">Clipboard API unavailable. Select and copy
                            the HTML below:</TSDiv>

                        <textarea
                            value={document.documentElement.outerHTML}
                            readOnly
                            className="flex-1 border rounded p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 overflow-auto"
                        />

                        <TSDiv className="flex gap-2">
                            <TSDiv
                                tag="button"
                                onClick={() => {
                                    const textarea = document.querySelector('textarea[readonly]') as HTMLTextAreaElement
                                    if (textarea) {
                                        textarea.select()
                                        document.execCommand('copy')
                                        setCopyStatus('✓ Copied!')
                                        setTimeout(() => {
                                            setShowTextarea(false)
                                            setCopyStatus(null)
                                        }, 1000)
                                    }
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
                            >
                                Copy
                            </TSDiv>
                            <TSDiv
                                tag="button"
                                onClick={() => {
                                    setShowTextarea(false)
                                    setCopyStatus(null)
                                }}
                                className="flex-1 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
                            >
                                Close
                            </TSDiv>
                        </TSDiv>
                    </TSDiv>
                </TSDiv>
            )}
        </TSDiv>
    )
}
