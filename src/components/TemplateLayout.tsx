import React from 'react'
import { TSDiv } from './TSDiv'

interface TemplateLayoutProps {
  title?: string
  children?: React.ReactNode
}

export function TemplateLayout({ title, children }: TemplateLayoutProps) {
  return (
    <TSDiv className="max-w-5xl mx-auto">
      {title && (
        <TSDiv className="mb-4 border-b pb-2">
          <TSDiv tag="h1" className="text-xl font-semibold">{title}</TSDiv>
        </TSDiv>
      )}
      <TSDiv>{children}</TSDiv>
    </TSDiv>
  )
}
