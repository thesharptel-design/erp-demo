import { describe, expect, it } from 'vitest'
import {
  getApprovalComposePopupWindowName,
  getApprovalDocTypeLabel,
  getApprovalDocTypeRule,
  getApprovalInboxDocTypeFilterOptions,
  getApprovalPopupWindowName,
} from '@/lib/approval-doc-type-rules'

describe('approval-doc-type-rules', () => {
  it('문서유형 라벨을 레지스트리에서 조회한다', () => {
    expect(getApprovalDocTypeLabel('draft_doc')).toBe('일반기안')
    expect(getApprovalDocTypeLabel('purchase_request')).toBe('구매품의')
    expect(getApprovalDocTypeLabel('leave_request')).toBe('휴가신청')
    expect(getApprovalDocTypeLabel('outbound_request')).toBe('출고요청')
  })

  it('미등록 문서유형은 원본 값(또는 빈값)으로 폴백한다', () => {
    expect(getApprovalDocTypeLabel('custom_doc')).toBe('custom_doc')
    expect(getApprovalDocTypeLabel(null)).toBe('')
  })

  it('통합함 유형 필터 옵션은 inboxVisible 규칙만 노출한다', () => {
    const options = getApprovalInboxDocTypeFilterOptions()
    expect(options[0]).toEqual({ value: '', label: '전체' })
    expect(options).toEqual(
      expect.arrayContaining([
        { value: 'draft_doc', label: '일반기안' },
        { value: 'purchase_request', label: '구매품의' },
        { value: 'leave_request', label: '휴가신청' },
        { value: 'outbound_request', label: '출고요청' },
      ])
    )
  })

  it('일반기안 상세/뷰/재상신 경로를 반환한다', () => {
    const rule = getApprovalDocTypeRule('draft_doc')
    expect(rule).not.toBeNull()
    if (!rule) return
    expect(
      rule.detailHrefResolver({
        approvalDocId: 10,
        outboundRequestId: null,
        writerId: null,
        currentUserId: null,
        status: 'submitted',
      })
    ).toBe('/approvals/10')
    expect(
      rule.detailViewHrefResolver({
        approvalDocId: 10,
        outboundRequestId: null,
        writerId: null,
        currentUserId: null,
        status: 'submitted',
      })
    ).toBe('/approvals/view/10')
    expect(
      rule.resubmitHrefResolver({
        approvalDocId: 10,
        outboundRequestId: null,
        writerId: 'u1',
        currentUserId: 'u1',
        status: 'rejected',
      })
    ).toBe('/approvals/new?resubmit=10')
  })

  it('출고요청 상세/뷰는 outbound_request_id 우선, 누락 시 approval view 폴백', () => {
    const rule = getApprovalDocTypeRule('outbound_request')
    expect(rule).not.toBeNull()
    if (!rule) return

    expect(
      rule.detailHrefResolver({
        approvalDocId: 21,
        outboundRequestId: 77,
        writerId: null,
        currentUserId: null,
        status: 'approved',
      })
    ).toBe('/outbound-requests/view/77')
    expect(
      rule.detailViewHrefResolver({
        approvalDocId: 21,
        outboundRequestId: null,
        writerId: null,
        currentUserId: null,
        status: 'approved',
      })
    ).toBe('/approvals/view/21')
  })

  it('출고요청 재상신은 일반기안 재상신과 분리된 경로를 쓴다', () => {
    const rule = getApprovalDocTypeRule('outbound_request')
    expect(rule).not.toBeNull()
    if (!rule) return
    expect(
      rule.resubmitHrefResolver({
        approvalDocId: 31,
        outboundRequestId: 901,
        writerId: 'owner',
        currentUserId: 'owner',
        status: 'draft',
      })
    ).toBe('/outbound-requests/new?resubmit=31')
  })

  it('작성 팝업 window name은 문서유형 규칙을 따른다', () => {
    expect(getApprovalComposePopupWindowName('draft_doc')).toBe('approvalDraftPopup')
    expect(getApprovalComposePopupWindowName('outbound_request')).toBe('outboundRequestDraftPopup')
    expect(getApprovalComposePopupWindowName('unknown')).toBe('approvalDraftPopup')
  })

  it('상세 팝업 window name은 mode/view-resubmit/outbound 규칙을 따른다', () => {
    expect(
      getApprovalPopupWindowName({
        docType: 'draft_doc',
        mode: 'view',
        approvalDocId: 8,
        outboundRequestId: null,
        writerId: null,
        currentUserId: null,
        status: 'submitted',
      })
    ).toBe('approvalDocView_8')

    expect(
      getApprovalPopupWindowName({
        docType: 'draft_doc',
        mode: 'open',
        approvalDocId: 8,
        outboundRequestId: null,
        writerId: 'u1',
        currentUserId: 'u1',
        status: 'rejected',
        resubmitDocId: 8,
      })
    ).toBe('approvalResubmit_8')

    expect(
      getApprovalPopupWindowName({
        docType: 'outbound_request',
        mode: 'view',
        approvalDocId: 999,
        outboundRequestId: 123,
        writerId: null,
        currentUserId: null,
        status: 'submitted',
      })
    ).toBe('outboundReqView_123')
  })
})
