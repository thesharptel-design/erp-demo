'use client'

import type { ReactNode } from 'react'

import type { ItemProcessCategories, ProcessMetadata } from '@/lib/item-config'
import { cn } from '@/lib/utils'

type Props = {
  meta: ProcessMetadata
  categories: ItemProcessCategories
  /** When true (default), last column is SOP and `sopCell` is rendered there. */
  showSopColumn?: boolean
  /** Last column (row 2) when `showSopColumn` is true. */
  sopCell?: ReactNode
  /** Equal width for each step column (excluding row labels and optional SOP). */
  equalStepWidths?: boolean
  className?: string
}

/** 2-row table: 공정상세 / steps [+ SOP], 공정체크 / ✓ [+ SOP]. Columns follow master config only (no stale check keys). */
export function ItemProcessDetailGrid({
  meta,
  categories,
  showSopColumn = true,
  sopCell,
  equalStepWidths = false,
  className,
}: Props) {
  const cat = (meta.category ?? '').trim()
  const labels = cat && cat in categories ? [...(categories[cat] ?? [])] : []
  const cols = labels
  const thBase =
    'border border-foreground px-1 py-1 align-middle text-[11px] font-semibold leading-tight min-w-0'
  const tdBase = 'border border-foreground px-1 py-1 align-middle text-center text-[11px] leading-tight min-w-0'

  const labelColPct = 8
  const sopColPct = showSopColumn ? 7 : 0
  const stepPct = cols.length > 0 ? (100 - labelColPct - sopColPct) / cols.length : 0
  const stepColStyle = equalStepWidths && cols.length > 0 ? ({ width: `${stepPct}%` } as const) : undefined
  const stepColClass = equalStepWidths ? '' : 'min-w-[3.25rem]'

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table
        className={cn(
          'w-full border-collapse border border-foreground text-foreground',
          equalStepWidths && cols.length > 0 && 'table-fixed'
        )}
      >
        {equalStepWidths && cols.length > 0 ? (
          <colgroup>
            <col style={{ width: `${labelColPct}%` }} />
            {cols.map((c) => (
              <col key={c} style={{ width: `${stepPct}%` }} />
            ))}
            {showSopColumn ? <col style={{ width: `${sopColPct}%` }} /> : null}
          </colgroup>
        ) : null}
        <tbody>
          <tr>
            <th className={cn(thBase, 'bg-muted/60 font-black', !equalStepWidths || cols.length === 0 ? 'w-20 shrink-0' : '')}>
              공정상세
            </th>
            {cols.length > 0 ? (
              cols.map((c) => (
                <th key={c} className={cn(thBase, 'bg-background', stepColClass)} style={stepColStyle} title={c}>
                  <span className="block truncate">{c}</span>
                </th>
              ))
            ) : (
              <th className={cn(thBase, 'bg-background text-muted-foreground')} colSpan={1}>
                —
              </th>
            )}
            {showSopColumn ? (
              <th className={cn(thBase, 'bg-background', !equalStepWidths || cols.length === 0 ? 'w-16 shrink-0' : '')}>SOP</th>
            ) : null}
          </tr>
          <tr>
            <th className={cn(thBase, 'bg-muted/60 font-black')}>공정체크</th>
            {cols.length > 0 ? (
              cols.map((c) => (
                <td key={c} className={cn(tdBase, stepColClass)} style={stepColStyle}>
                  {meta.checks?.[c] ? '✓' : ''}
                </td>
              ))
            ) : (
              <td className={tdBase} />
            )}
            {showSopColumn ? <td className={cn(tdBase, 'p-1')}>{sopCell}</td> : null}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
