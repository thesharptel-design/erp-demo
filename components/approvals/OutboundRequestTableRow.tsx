'use client'

import { memo, useCallback, type MouseEvent } from 'react'
import type { Database } from '@/lib/database.types'
import type { ApprovalDocLike, ApprovalLineLike } from '@/lib/approval-status'
import { getOutboundRequestRowPresentation } from '@/lib/approval-status'
import { openOutboundRequestDetailViewPopup } from '@/lib/approval-popup'
import { Badge } from '@/components/ui/badge'
import { LinkTruncateText, TruncateText } from '@/components/approvals/ApprovalTableCells'

type OutboundRequestRow = Database['public']['Tables']['outbound_requests']['Row'] & {
  approval_doc?: (ApprovalDocLike & { approval_lines?: ApprovalLineLike[] }) | null
  warehouses?: { name: string | null } | null
}

type OutboundRequestTableRowProps = {
  request: OutboundRequestRow
  requesterName: string
  customerName: string
  dispatchStateLabel: string
}

function OutboundRequestTableRowBase({
  request,
  requesterName,
  customerName,
  dispatchStateLabel,
}: OutboundRequestTableRowProps) {
  const lines = request.approval_doc?.approval_lines ?? []
  const statusInfo = getOutboundRequestRowPresentation({
    approvalDoc: request.approval_doc,
    lines,
    reqStatus: request.status,
    dispatchState: request.dispatch_state,
  })
  const href = `/outbound-requests/view/${request.id}`
  const handleOpen = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (e.button !== 0) return
    e.preventDefault()
    openOutboundRequestDetailViewPopup(request.id)
  }, [request.id])

  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-3 py-3 font-semibold md:px-4 md:py-4">
        <LinkTruncateText
          href={href}
          text={request.req_no || `REQ-${request.id}`}
          onOpen={handleOpen}
          className="block min-w-0 truncate text-primary underline-offset-2 hover:underline"
        />
      </td>
      <td className="px-2 py-3 text-center md:py-4">
        <span className={statusInfo.className}>{statusInfo.label}</span>
      </td>
      <td className="px-2 py-3 text-center md:py-4">
        <Badge variant="outline" className="font-semibold">
          {dispatchStateLabel}
        </Badge>
      </td>
      <td className="px-3 py-3 text-sm font-medium text-foreground md:px-4 md:py-4">
        <TruncateText text={request.dispatch_handler_name ?? '-'} />
      </td>
      <td className="px-2 py-3 text-xs font-medium text-muted-foreground md:px-3 md:py-4">
        {request.req_date}
      </td>
      <td className="px-3 py-3 text-sm font-medium text-foreground md:px-4 md:py-4">
        <TruncateText text={requesterName} />
      </td>
      <td className="px-3 py-3 text-sm font-medium text-muted-foreground md:px-4 md:py-4">
        <TruncateText text={request.warehouses?.name ?? '-'} />
      </td>
      <td className="px-3 py-3 text-sm font-medium text-foreground md:px-4 md:py-4">
        <TruncateText text={customerName} />
      </td>
      <td className="px-3 py-3 text-sm font-medium text-foreground md:px-4 md:py-4">
        <TruncateText text={request.purpose ?? '-'} />
      </td>
      <td className="px-3 py-3 text-xs font-medium text-muted-foreground md:px-4 md:py-4">
        <TruncateText text={request.approval_doc?.remarks || request.remarks || '-'} />
      </td>
    </tr>
  )
}

const OutboundRequestTableRow = memo(OutboundRequestTableRowBase)
export default OutboundRequestTableRow
