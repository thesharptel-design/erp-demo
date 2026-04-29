export type ApprovalDocRuleContext = {
  approvalDocId: number
  outboundRequestId: number | null
  writerId: string | null | undefined
  currentUserId: string | null | undefined
  status: string | null | undefined
}

export type ApprovalDocTypeRule = {
  docType: string
  label: string
  inboxVisible: boolean
  composeHref: string | null
  composeWindowName: string
  supportsGeneralResubmit: boolean
  detailHrefResolver: (ctx: ApprovalDocRuleContext) => string
  detailViewHrefResolver: (ctx: ApprovalDocRuleContext) => string
  resubmitHrefResolver: (ctx: ApprovalDocRuleContext) => string | null
  popupWindowNameResolver: (
    ctx: ApprovalDocRuleContext & { mode: 'view' | 'open'; resubmitDocId?: number | null }
  ) => string
}

/**
 * 문서유형 분기 전수 인벤토리 (현재 코드 기준):
 * - `lib/approval-status.ts`: 라벨/상세/열기(재상신) 분기
 * - `lib/approval-popup.ts`: popup window name 분기(url 기반)
 * - `app/approvals/page.tsx`: 통합함 문서유형 필터 옵션
 * - `lib/approval-draft.ts`: 일반기안 작성 가능한 문서유형 옵션
 * - `lib/approval-inbox-rpc.ts`: RPC row -> outbound 연계 id 매핑
 */
export const APPROVAL_DOC_TYPE_BRANCH_INVENTORY = [
  'lib/approval-status.ts',
  'lib/approval-popup.ts',
  'app/approvals/page.tsx',
  'lib/approval-draft.ts',
  'lib/approval-inbox-rpc.ts',
] as const

function isWriterInEditableStatus(ctx: ApprovalDocRuleContext): boolean {
  const uid =
    ctx.currentUserId != null && String(ctx.currentUserId).trim() !== ''
      ? String(ctx.currentUserId).toLowerCase()
      : ''
  const wid = ctx.writerId != null ? String(ctx.writerId).toLowerCase() : ''
  return uid !== '' && wid === uid && (ctx.status === 'draft' || ctx.status === 'rejected')
}

const RULES: Record<string, ApprovalDocTypeRule> = {
  draft_doc: {
    docType: 'draft_doc',
    label: '일반기안',
    inboxVisible: true,
    composeHref: '/approvals/new',
    composeWindowName: 'approvalDraftPopup',
    supportsGeneralResubmit: true,
    detailHrefResolver: (ctx) => `/approvals/${ctx.approvalDocId}`,
    detailViewHrefResolver: (ctx) => `/approvals/view/${ctx.approvalDocId}`,
    resubmitHrefResolver: (ctx) =>
      isWriterInEditableStatus(ctx) ? `/approvals/new?resubmit=${ctx.approvalDocId}` : null,
    popupWindowNameResolver: (ctx) =>
      ctx.mode === 'open' && ctx.resubmitDocId != null
        ? `approvalResubmit_${ctx.resubmitDocId}`
        : `approvalDocView_${ctx.approvalDocId}`,
  },
  purchase_request: {
    docType: 'purchase_request',
    label: '구매품의',
    inboxVisible: true,
    composeHref: '/approvals/new',
    composeWindowName: 'approvalDraftPopup',
    supportsGeneralResubmit: true,
    detailHrefResolver: (ctx) => `/approvals/${ctx.approvalDocId}`,
    detailViewHrefResolver: (ctx) => `/approvals/view/${ctx.approvalDocId}`,
    resubmitHrefResolver: (ctx) =>
      isWriterInEditableStatus(ctx) ? `/approvals/new?resubmit=${ctx.approvalDocId}` : null,
    popupWindowNameResolver: (ctx) =>
      ctx.mode === 'open' && ctx.resubmitDocId != null
        ? `approvalResubmit_${ctx.resubmitDocId}`
        : `approvalDocView_${ctx.approvalDocId}`,
  },
  leave_request: {
    docType: 'leave_request',
    label: '휴가신청',
    inboxVisible: true,
    composeHref: '/approvals/new',
    composeWindowName: 'approvalDraftPopup',
    supportsGeneralResubmit: true,
    detailHrefResolver: (ctx) => `/approvals/${ctx.approvalDocId}`,
    detailViewHrefResolver: (ctx) => `/approvals/view/${ctx.approvalDocId}`,
    resubmitHrefResolver: (ctx) =>
      isWriterInEditableStatus(ctx) ? `/approvals/new?resubmit=${ctx.approvalDocId}` : null,
    popupWindowNameResolver: (ctx) =>
      ctx.mode === 'open' && ctx.resubmitDocId != null
        ? `approvalResubmit_${ctx.resubmitDocId}`
        : `approvalDocView_${ctx.approvalDocId}`,
  },
  outbound_request: {
    docType: 'outbound_request',
    label: '출고요청',
    inboxVisible: true,
    composeHref: '/outbound-requests/new',
    composeWindowName: 'outboundRequestDraftPopup',
    supportsGeneralResubmit: false,
    detailHrefResolver: (ctx) =>
      ctx.outboundRequestId != null
        ? `/outbound-requests/view/${ctx.outboundRequestId}`
        : `/approvals/${ctx.approvalDocId}`,
    detailViewHrefResolver: (ctx) =>
      ctx.outboundRequestId != null
        ? `/outbound-requests/view/${ctx.outboundRequestId}`
        : `/approvals/view/${ctx.approvalDocId}`,
    resubmitHrefResolver: (ctx) =>
      isWriterInEditableStatus(ctx) ? `/outbound-requests/new?resubmit=${ctx.approvalDocId}` : null,
    popupWindowNameResolver: (ctx) => {
      if (ctx.outboundRequestId != null) return `outboundReqView_${ctx.outboundRequestId}`
      if (ctx.mode === 'open' && ctx.resubmitDocId != null) return `approvalResubmit_${ctx.resubmitDocId}`
      return `approvalDocView_${ctx.approvalDocId}`
    },
  },
}

export function getApprovalDocTypeRule(docType: string | null | undefined): ApprovalDocTypeRule | null {
  const key = String(docType ?? '').trim()
  if (!key) return null
  return RULES[key] ?? null
}

export function getApprovalDocTypeLabel(docType: string | null | undefined): string {
  const rule = getApprovalDocTypeRule(docType)
  return rule?.label ?? (docType ?? '')
}

export function getApprovalInboxDocTypeFilterOptions(): Array<{ value: string; label: string }> {
  const ruleList = Object.values(RULES).filter((rule) => rule.inboxVisible)
  return [
    { value: '', label: '전체' },
    ...ruleList.map((rule) => ({ value: rule.docType, label: rule.label })),
  ]
}

export function getApprovalComposePopupWindowName(docType: string | null | undefined): string {
  return getApprovalDocTypeRule(docType)?.composeWindowName ?? 'approvalDraftPopup'
}

export function getApprovalPopupWindowName(input: {
  docType: string | null | undefined
  mode: 'view' | 'open'
  approvalDocId: number
  outboundRequestId: number | null
  writerId: string | null | undefined
  currentUserId: string | null | undefined
  status: string | null | undefined
  resubmitDocId?: number | null
}): string {
  const rule = getApprovalDocTypeRule(input.docType)
  if (!rule) {
    if (input.mode === 'open' && input.resubmitDocId != null) return `approvalResubmit_${input.resubmitDocId}`
    return `approvalDocView_${input.approvalDocId}`
  }
  return rule.popupWindowNameResolver({
    mode: input.mode,
    approvalDocId: input.approvalDocId,
    outboundRequestId: input.outboundRequestId,
    writerId: input.writerId,
    currentUserId: input.currentUserId,
    status: input.status,
    resubmitDocId: input.resubmitDocId ?? null,
  })
}
