import React from 'react'

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4">
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                        <h2 className="font-bold text-lg mb-2">Component Error</h2>
                        <p className="text-sm">{this.state.error?.message || 'An error occurred'}</p>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
