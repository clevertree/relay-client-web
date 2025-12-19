import React from 'react'
import { TSDiv } from './TSDiv'

type ErrorBoundaryProps = {
  children: React.ReactNode
  initialError?: Error
}

type ErrorBoundaryState = { hasError: boolean; error?: any; info?: any }

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = props.initialError
      ? { hasError: true, error: props.initialError }
      : { hasError: false }
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, info: any) {
    // Store component stack for display
    this.setState({ info })
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught render error:', error, info)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.props.initialError && this.props.initialError !== prevProps.initialError) {
      this.setState({ hasError: true, error: this.props.initialError })
    }
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error ?? this.props.initialError
      const message = error?.message || String(error)
      const stack = error?.stack || this.state.info?.componentStack || ''
      const version = (globalThis as any).__hook_transpiler_version || 'unknown'
      const title = this.props.initialError
        ? 'Hook transpiler failed to initialize'
        : 'Render Error'
      const severityHint = this.props.initialError
        ? 'The async WASM loader failed before render was attempted. JSX transpilation will be unavailable until the issue is resolved.'
        : 'An error occurred while rendering the component tree.'

      // Try to extract line number from error message or stack
      const lineMatch = message.match(/line (\d+)|:(\d+)/) || stack.match(/line (\d+)|:(\d+)/)
      const lineNum = lineMatch ? (lineMatch[1] || lineMatch[2]) : null

      return (
        <TSDiv className="p-8 bg-[var(--bg-error)] border rounded-lg text-[var(--text-error)] max-w-4xl">
          <TSDiv tag="h3" className="mt-0 text-lg font-bold">{title}</TSDiv>
          <TSDiv tag="p" className="font-semibold text-base">{message}</TSDiv>
          <TSDiv tag="p" className="text-sm leading-relaxed opacity-80">{severityHint}</TSDiv>
          <TSDiv tag="p" className="text-sm opacity-80">Hook Transpiler v{version}</TSDiv>

          {lineNum && (
            <TSDiv className="mt-2 text-sm bg-[var(--bg-error-detail)] p-2 rounded">
              Error Location: Line {lineNum}
            </TSDiv>
          )}

          {stack && (
            <>
              <TSDiv
                tag="details"
                className="mt-4"
              >
                <TSDiv
                  tag="summary"
                  className="cursor-pointer font-semibold text-sm hover:underline"
                >
                  Stack Trace ({stack.split('\n').length} lines)
                </TSDiv>
                <TSDiv tag="pre" className="mt-2 text-xs max-h-96 overflow-auto whitespace-pre-wrap bg-red-900 bg-opacity-20 p-3 rounded font-mono">
                  {stack}
                </TSDiv>
              </TSDiv>
            </>
          )}

          <TSDiv className="mt-4 text-sm">
            <TSDiv tag="p" className="font-semibold mb-2">Troubleshooting Tips:</TSDiv>
            <TSDiv tag="ul" className="list-disc pl-5 space-y-1 opacity-90">
              <TSDiv tag="li">Check the browser console for initialization stack traces and wasm fetch timings</TSDiv>
              <TSDiv tag="li">Verify the hook-transpiler wasm bundle is present and up-to-date</TSDiv>
              <TSDiv tag="li">Ensure your JSX entry file is syntactically valid and references the correct hooks</TSDiv>
              <TSDiv tag="li">Restart the dev server to rehydrate the wasm loader if assets have changed</TSDiv>
            </TSDiv>
          </TSDiv>
        </TSDiv>
      )
    }
    return this.props.children as any
  }
}

export default ErrorBoundary
