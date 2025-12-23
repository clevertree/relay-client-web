import React from 'react'
import { TSDiv as BaseTSDiv } from '@clevertree/themed-styler'
import { unifiedBridge, styleManager } from '@clevertree/themed-styler'

type DivProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
  tag?: string
  [key: string]: any
}

export const TSDiv: React.FC<DivProps> = (props) => {
  return (
    <BaseTSDiv
      {...props}
      onElement={(tag, p) => {
        try {
          unifiedBridge.registerUsage(tag, p)
          styleManager.requestRender()
        } catch (e) { }
      }}
    />
  )
}
