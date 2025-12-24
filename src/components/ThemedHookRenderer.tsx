import React from 'react'
import { HookRenderer as BaseHookRenderer, type HookRendererProps } from '@clevertree/hook-transpiler'
import { unifiedBridge, styleManager } from '@clevertree/themed-styler'
import { VideoPlayer } from './VideoPlayer'
import { TSDiv } from './TSDiv'

// Safe media components for Markdown
function SafeVideoComponent({ children, ...props }: any) {
    const allowedAttrs = ['id', 'src', 'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'preload', 'poster']
    const safeProps: Record<string, any> = {}
    for (const [key, value] of Object.entries(props)) {
        if (allowedAttrs.includes(key)) safeProps[key] = value
    }
    return <TSDiv tag="video" {...safeProps} style={{ maxWidth: '100%' }}>{children}</TSDiv>
}

const markdownOverrides = {
    video: SafeVideoComponent,
    VideoPlayer: VideoPlayer as any,
}

const ThemedHookRenderer: React.FC<HookRendererProps> = (props) => {
    // Expose themed-styler to hook builtins
    React.useEffect(() => {
        (globalThis as any).__themed_styler_exports = { unifiedBridge, styleManager }
        return () => {
            delete (globalThis as any).__themed_styler_exports
        }
    }, [])

    return (
        <BaseHookRenderer
            {...props}
            markdownOverrides={markdownOverrides}
            onElement={(tag, props) => unifiedBridge.registerUsage(tag, props)}
            requestRender={() => styleManager.requestRender()}
            renderCssIntoDom={() => styleManager.renderCssIntoDom()}
            startAutoSync={(interval) => styleManager.startAutoSync(interval)}
            stopAutoSync={() => styleManager.stopAutoSync()}
            registerTheme={(name, defs) => unifiedBridge.registerTheme(name, defs)}
            loadThemesFromYamlUrl={(url) => unifiedBridge.loadThemesFromYamlUrl(url)}
        />
    )
}

export default ThemedHookRenderer
