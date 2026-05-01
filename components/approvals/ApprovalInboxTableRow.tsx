'use client'

import { memo, useCallback, type MouseEvent, type ReactNode } from 'react'
import { getDocDetailOpenHref, type ApprovalDocLike } from '@/lib/approval-status'
import { openApprovalDocFromInbox } from '@/lib/approval-popup'
import { LinkTruncateText, TruncateText, displayText } from '@/components/approvals/ApprovalTableCells'

type ApprovalInboxRowBadge = {
  label: string
  className: string
}

type ApprovalInboxDocRow = ApprovalDocLike & {
  id: number
  writer_id?: string | null
  doc_no: string | null
  title: string | null
  drafted_at: string | null
  recent_reject_comment?: string | null
  hasLineOpinion: boolean
  progressLabel: string
  approverLineNames: string
}

type ApprovalInboxTableRowProps = {
  doc: ApprovalInboxDocRow
  inboxViewerId: string | null
  typeLabel: string
  draftDate: string
  collapsedLine: string
  activeProgress: string
  pendingNames: string[]
  statusBadges: ApprovalInboxRowBadge[]
  expanded: boolean
  onToggleExpanded: (docId: number) => void
  renderApproverLineWithPendingHighlight: (line: string, pendingNames: string[]) => ReactNode
  docNoTrailingAction?: ReactNode
  showTypeColumn?: boolean
}

function ApprovalInboxTableRowBase({
  doc,
  inboxViewerId,
  typeLabel,
  draftDate,
  collapsedLine,
  activeProgress,
  pendingNames,
  statusBadges,
  expanded,
  onToggleExpanded,
  renderApproverLineWithPendingHighlight,
  docNoTrailingAction,
  showTypeColumn = true,
}: ApprovalInboxTableRowProps) {
  const href = getDocDetailOpenHref(doc, inboxViewerId)
  const handleOpen = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (e.button !== 0) return
      e.preventDefault()
      openApprovalDocFromInbox(doc, inboxViewerId)
    },
    [doc, inboxViewerId]
  )

  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-3 py-3 font-semibold md:px-4 md:py-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <LinkTruncateText
            href={href}
            text={doc.doc_no}
            onOpen={handleOpen}
            className="block min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline"
          />
          {docNoTrailingAction}
        </div>
      </td>
      {showTypeColumn ? (
        <td className="px-2 py-3 text-center text-xs font-medium text-muted-foreground md:py-4">
          <TruncateText text={typeLabel} className="mx-auto max-w-full cursor-default" />
        </td>
      ) : null}
      <td className="px-3 py-3 font-semibold text-foreground md:px-4 md:py-4">
        <div className="min-w-0 space-y-1">
          <a href={href} onClick={handleOpen} className="block min-w-0" title={displayText(doc.title)}>
            <TruncateText
              text={doc.title}
              className="cursor-pointer text-[15px] font-bold text-primary underline-offset-2 hover:underline"
            />
          </a>
          {doc.recent_reject_comment ? (
            <p
              className="block min-w-0 truncate text-xs font-medium text-destructive"
              title={`반려 코멘트: ${doc.recent_reject_comment}`}
            >
              반려 코멘트: {doc.recent_reject_comment}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-2.5 py-3 text-sm font-medium text-foreground md:px-3 md:py-4">
        <div className="relative inline-block max-w-full align-top">
          <button
            type="button"
            onClick={() => onToggleExpanded(doc.id)}
            className="block max-w-full truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            title={doc.approverLineNames}
            aria-expanded={expanded}
          >
            {collapsedLine}
          </button>
          {expanded ? (
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-0 max-w-[22rem] whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg">
              {renderApproverLineWithPendingHighlight(doc.approverLineNames, pendingNames)}
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-xs font-medium leading-relaxed text-foreground md:px-4 md:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <TruncateText text={activeProgress} className="cursor-default" />
          </div>
          <span
            aria-label={doc.hasLineOpinion ? '결재·협조 의견 있음' : '결재·협조 의견 없음'}
            title={doc.hasLineOpinion ? '등록된 결재·협조 의견이 있습니다.' : '등록된 의견이 없습니다.'}
            className={`shrink-0 select-none rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              doc.hasLineOpinion
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground'
            }`}
          >
            의견
          </span>
        </div>
      </td>
      <td className="px-2 py-3 text-center md:py-4">
        <div className="flex flex-wrap items-center justify-center gap-1" title={statusBadges.map((b) => b.label).join(' · ')}>
          {statusBadges.map((b, i) => (
            <span key={i} className={`${b.className} inline-block max-w-full truncate align-middle`}>
              {b.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-3 text-xs font-medium text-muted-foreground md:px-3 md:py-4">
        <TruncateText text={draftDate || null} className="cursor-default" />
      </td>
    </tr>
  )
}

const ApprovalInboxTableRow = memo(ApprovalInboxTableRowBase)
export default ApprovalInboxTableRow
