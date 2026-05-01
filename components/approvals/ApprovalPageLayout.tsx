'use client'

import type { ReactNode } from 'react'
import PageHeader from '@/components/PageHeader'

type ApprovalPageLayoutProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export default function ApprovalPageLayout({
  title,
  description,
  actions,
  children,
}: ApprovalPageLayoutProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  )
}
