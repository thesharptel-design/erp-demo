'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export default function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="text-left">
        <h1 className={cn('text-xl font-normal leading-snug tracking-tight text-foreground sm:text-2xl', titleClassName)}>
          {title}
        </h1>
        {description ? (
          <p className={cn('mt-1 text-sm text-muted-foreground', descriptionClassName)}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0 self-start sm:self-auto">{actions}</div> : null}
    </div>
  )
}
