import React, { useEffect } from 'react'
import { unifiedBridge, styleManager } from '@clevertree/themed-styler'

type DivProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
  tag?: string
}

export const TSDiv: React.FC<DivProps> = ({ children, tag = 'div', ...props }) => {
  // Register usage for themed-styler tracking
  useEffect(() => {
    try {
      unifiedBridge.registerUsage(tag, props as any)
      styleManager.requestRender()
    } catch (e) {
      // no-op
    }
  }, [props.className, tag])

  // Special handling for void elements - they cannot have children
  const voidElements = ['img', 'input', 'br', 'hr', 'area', 'base', 'col', 'embed', 'link', 'meta', 'param', 'source', 'track', 'wbr']
  if (voidElements.includes(tag)) {
    return React.createElement(tag, props)
  }

  return React.createElement(tag, props, children)
}
