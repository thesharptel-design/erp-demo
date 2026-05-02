import { describe, expect, it } from 'vitest'
import {
  buildPostApprovalCancelPaperRow,
  canLastApproverDirectCancelFinalApproval,
  canWriterDeleteApprovalDoc,
  formatApprovalProgressChain,
  formatApproverLineNames,
  formatCancellationProgressChain,
  formatInboxApproverLineDisplay,
  getApprovalDocDetailedStatusLabel,
  getApprovalDocDetailedStatusPresentation,
  getDocDetailOpenHref,
  getOutboundDispatchStatePresentation,
  getOutboundRequestRowPresentation,
  getUnifiedApprovalWorkflowBadges,
  isApprovalCancellationRemarkProcess,
  isRejectedAsPostApprovalCancel,
  splitLegacyPostApprovalCancelFromContent,
} from '@/lib/approval-status'

/** Mirrors `ApprovalActionButtons` admin-delete confirm: first badge label only. */
function adminDeleteConfirmStatusLabel(
  doc: Parameters<typeof getApprovalDocDetailedStatusPresentation>[0],
  lines: Parameters<typeof getApprovalDocDetailedStatusPresentation>[1]
) {
  return getApprovalDocDetailedStatusPresentation(doc, lines).badges[0]?.label ?? String(doc.status ?? '')
}

describe('canWriterDeleteApprovalDoc', () => {
  it('allows delete for rejected', () => {
    expect(canWriterDeleteApprovalDoc({ status: 'rejected', remarks: '결재자 반려' })).toBe(true)
  })

  it('allows delete for recall draft', () => {
    expect(canWriterDeleteApprovalDoc({ status: 'draft', remarks: '기안 회수됨' })).toBe(true)
  })

  it('denies delete for plain draft', () => {
    expect(canWriterDeleteApprovalDoc({ status: 'draft', remarks: '웹 등록 문서' })).toBe(false)
    expect(canWriterDeleteApprovalDoc({ status: 'draft', remarks: null })).toBe(false)
  })

  it('denies delete for in-flight doc', () => {
    expect(canWriterDeleteApprovalDoc({ status: 'in_review', remarks: null })).toBe(false)
  })
})

describe('isApprovalCancellationRemarkProcess', () => {
  it('detects cancellation flow remarks', () => {
    expect(isApprovalCancellationRemarkProcess('취소 요청 중')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('결재자 취소완료')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('검토자 취소승인')).toBe(true)
    expect(isApprovalCancellationRemarkProcess('결재자 반려')).toBe(false)
  })
})

describe('isRejectedAsPostApprovalCancel & splitLegacy', () => {
  it('detects post-approval cancel remark only when rejected', () => {
    expect(isRejectedAsPostApprovalCancel({ status: 'rejected', remarks: '결재 취소' })).toBe(true)
    expect(isRejectedAsPostApprovalCancel({ status: 'rejected', remarks: '결재자 반려' })).toBe(false)
    expect(isRejectedAsPostApprovalCancel({ status: 'approved', remarks: '결재 취소' })).toBe(false)
  })

  it('strips legacy marker from body and captures opinion', () => {
    const r = splitLegacyPostApprovalCancelFromContent('본문A\n\n[결재 취소 의견]: 반려한다')
    expect(r.cleanBody).toBe('본문A')
    expect(r.legacyOpinion).toBe('반려한다')
  })
})

describe('buildPostApprovalCancelPaperRow', () => {
  it('returns row with DB columns when present', () => {
    const r = buildPostApprovalCancelPaperRow(
      {
        status: 'rejected',
        remarks: '결재 취소',
        content: '본문',
        post_approval_cancel_opinion: '의견',
        post_approval_cancel_by: 'u1',
        post_approval_cancel_at: '2026-01-02T00:00:00.000Z',
      },
      '김결재'
    )
    expect(r.cleanBody).toBe('본문')
    expect(r.row?.actorName).toBe('김결재')
    expect(r.row?.opinion).toBe('의견')
    expect(r.row?.at).toBe('2026-01-02T00:00:00.000Z')
  })

  it('falls back to legacy opinion in content', () => {
    const r = buildPostApprovalCancelPaperRow(
      {
        status: 'rejected',
        remarks: '결재 취소',
        content: '본문B\n\n[결재 취소 의견]: 구버전',
      },
      null
    )
    expect(r.cleanBody).toBe('본문B')
    expect(r.row?.opinion).toBe('구버전')
    expect(r.row?.actorName).toBe('—')
  })
})

describe('getUnifiedApprovalWorkflowBadges rejected vs 결재취소', () => {
  it('labels 결재취소 when remarks match post-approval cancel', () => {
    const b = getUnifiedApprovalWorkflowBadges(
      { status: 'rejected', remarks: '결재 취소', current_line_no: 1, doc_type: 'draft_doc' },
      [{ line_no: 1, approver_role: 'approver', status: 'waiting' }]
    )
    expect(b[0]?.label).toBe('결재취소')
  })

  it('labels 반려 for ordinary reject', () => {
    const b = getUnifiedApprovalWorkflowBadges(
      { status: 'rejected', remarks: '결재자 반려', current_line_no: 1, doc_type: 'draft_doc' },
      [{ line_no: 1, approver_role: 'approver', status: 'rejected' }]
    )
    expect(b[0]?.label).toBe('반려')
  })
})

describe('canLastApproverDirectCancelFinalApproval', () => {
  const docApproved = { status: 'approved' as const, remarks: null as string | null }

  it('is true only for the last approved action-line approver', () => {
    const flow = [
      { line_no: 1, approver_id: 'a111', approver_role: 'approver', status: 'approved' },
      { line_no: 2, approver_id: 'b222', approver_role: 'approver', status: 'approved' },
    ]
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: docApproved,
        orderedFlow: flow,
        currentUserId: 'b222',
      })
    ).toBe(true)
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: docApproved,
        orderedFlow: flow,
        currentUserId: 'a111',
      })
    ).toBe(false)
  })

  it('is true for sole final approver', () => {
    const flow = [
      { line_no: 1, approver_id: 'c333', approver_role: 'approver', status: 'approved' },
    ]
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: docApproved,
        orderedFlow: flow,
        currentUserId: 'c333',
      })
    ).toBe(true)
  })

  it('is false during cancellation relay remarks', () => {
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: { status: 'approved', remarks: '취소 요청 중' },
        orderedFlow: [
          { line_no: 1, approver_id: 'c333', approver_role: 'approver', status: 'approved' },
        ],
        currentUserId: 'c333',
      })
    ).toBe(false)
  })

  it('is false when doc is not approved', () => {
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: { status: 'in_review', remarks: null },
        orderedFlow: [
          { line_no: 1, approver_id: 'c333', approver_role: 'approver', status: 'approved' },
        ],
        currentUserId: 'c333',
      })
    ).toBe(false)
  })

  it('결재(approver)가 아닌 역할은 마지막 승인자 판정에서 제외한다', () => {
    expect(
      canLastApproverDirectCancelFinalApproval({
        doc: { status: 'approved', remarks: null },
        orderedFlow: [
          { line_no: 1, approver_id: 'u1', approver_role: 'reviewer', status: 'approved' },
          { line_no: 2, approver_id: 'u2', approver_role: 'approver', status: 'approved' },
        ],
        currentUserId: 'u1',
      })
    ).toBe(false)
  })
})

describe('getApprovalDocDetailedStatusLabel', () => {
  it('shows 상신취소·작성복귀 when draft was recalled', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'draft',
        remarks: '기안 회수됨',
        current_line_no: null,
        doc_type: 'outbound_request',
      })
    ).toBe('상신취소·작성복귀')
  })

  it('prioritises cancellation remarks over status', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'approved',
        remarks: '취소 요청 중',
        current_line_no: 1,
        doc_type: 'outbound_request',
      })
    ).toBe('기안자 취소요청')
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'in_progress',
        remarks: '기안자 취소요청',
        current_line_no: 2,
        doc_type: 'draft_doc',
      })
    ).toBe('기안자 취소요청')
  })

  it('maps in_review without lines to unified 진행중', () => {
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'in_review',
        remarks: null,
        current_line_no: 2,
        doc_type: 'draft_doc',
      })
    ).toBe('결재,협조진행중')
    expect(
      getApprovalDocDetailedStatusLabel({
        status: 'submitted',
        remarks: null,
        current_line_no: 3,
        doc_type: 'draft_doc',
      })
    ).toBe('결재,협조진행중')
  })
})

describe('formatCancellationProgressChain', () => {
  it('maps cancel request and relay remarks', () => {
    expect(formatCancellationProgressChain({ status: 'approved', remarks: '취소 요청 중', current_line_no: 1 })).toContain(
      '취소요청'
    )
    expect(formatCancellationProgressChain({ status: 'in_progress', remarks: '기안자 취소요청', current_line_no: 2 })).toContain(
      '취소요청'
    )
    expect(
      formatCancellationProgressChain({ status: 'approved', remarks: '결재자 취소완료', current_line_no: 1 })
    ).toContain('역순취소진행')
    expect(formatCancellationProgressChain({ status: 'approved', remarks: '결재자 취소승인', current_line_no: 0 })).toContain(
      '재고환원 대기'
    )
    expect(
      formatCancellationProgressChain({ status: 'rejected', remarks: '취소 완료(재고환원)', current_line_no: null })
    ).toBe('취소처리완료(재고환원)')
    expect(formatCancellationProgressChain({ status: 'rejected', remarks: '결재 중 취소됨', current_line_no: null })).toContain(
      '결재진행'
    )
    expect(formatCancellationProgressChain({ status: 'approved', remarks: null, current_line_no: 1 })).toBeNull()
  })
})

describe('getApprovalDocDetailedStatusPresentation', () => {
  it('returns 결재완료/협조대기 when approved but cooperator still waiting', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks: null, current_line_no: null, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'waiting' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재완료/협조대기'])
  })

  it('returns single 최종승인 when approved and no pending cooperator', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks: null, current_line_no: null, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'approved' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['최종승인'])
  })

  it('returns 결재진행/협조완료 when next pending is approver and all cooperators approved', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'in_review', remarks: null, current_line_no: 3, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'cooperator', status: 'approved' },
        { line_no: 3, approver_role: 'approver', status: 'pending' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재진행/협조완료'])
  })

  it('returns 결재완료/협조대기 when doc still in_review but all approvers approved and cooperator pending (사후 협조)', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'in_review', remarks: null, current_line_no: 4, doc_type: 'draft_doc' },
      [
        { line_no: 1, approver_role: 'approver', status: 'approved' },
        { line_no: 2, approver_role: 'approver', status: 'approved' },
        { line_no: 3, approver_role: 'cooperator', status: 'pending' },
      ]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['결재완료/협조대기'])
  })

  it('returns 상신취소·작성복귀 badge when draft with 기안 회수됨', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'draft', remarks: '기안 회수됨', current_line_no: 1, doc_type: 'outbound_request' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['상신취소·작성복귀'])
  })

  it('returns 임시저장 for plain draft', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'draft', remarks: '웹 등록 문서', current_line_no: null, doc_type: 'draft_doc' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['임시저장'])
  })

  it('returns 반려 for rejected doc', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'rejected', remarks: '결재자 반려', current_line_no: null, doc_type: 'draft_doc' },
      [{ line_no: 1, approver_role: 'approver', status: 'rejected' }]
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['반려'])
  })

  it('returns 기안자 취소요청 when remarks show cancel request', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks: '취소 요청 중', current_line_no: 1, doc_type: 'draft_doc' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['기안자 취소요청'])

    const v2Pres = getApprovalDocDetailedStatusPresentation(
      { status: 'in_progress', remarks: '기안자 취소요청', current_line_no: 2, doc_type: 'draft_doc' },
      []
    )
    expect(v2Pres.badges.map((b) => b.label)).toEqual(['기안자 취소요청'])
  })

  it('uses full remarks as label for 취소완료 relay step without 재고환원', () => {
    const remarks = '결재자 취소완료'
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'approved', remarks, current_line_no: 1, doc_type: 'outbound_request' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual([remarks])
  })

  it('returns 취소 완료됨 for finished stock-return cancellation', () => {
    const pres = getApprovalDocDetailedStatusPresentation(
      { status: 'rejected', remarks: '취소 완료(재고환원)', current_line_no: null, doc_type: 'outbound_request' },
      []
    )
    expect(pres.badges.map((b) => b.label)).toEqual(['취소 완료됨'])
  })
})

describe('admin delete confirm label (first presentation badge)', () => {
  it('matches getApprovalDocDetailedStatusLabel when both derive from the same single-badge presentation', () => {
    const cases: Array<{
      doc: Parameters<typeof getApprovalDocDetailedStatusPresentation>[0]
      lines: Parameters<typeof getApprovalDocDetailedStatusPresentation>[1]
    }> = [
      { doc: { status: 'draft', remarks: null, current_line_no: null, doc_type: 'draft_doc' }, lines: [] },
      {
        doc: { status: 'draft', remarks: '기안 회수됨', current_line_no: null, doc_type: 'draft_doc' },
        lines: [],
      },
      {
        doc: { status: 'rejected', remarks: '결재자 반려', current_line_no: null, doc_type: 'draft_doc' },
        lines: [{ line_no: 1, approver_role: 'approver', status: 'rejected' }],
      },
      {
        doc: { status: 'approved', remarks: '취소 요청 중', current_line_no: 1, doc_type: 'draft_doc' },
        lines: [],
      },
      {
        doc: { status: 'approved', remarks: '결재자 취소완료', current_line_no: 1, doc_type: 'outbound_request' },
        lines: [],
      },
      {
        doc: { status: 'rejected', remarks: '취소 완료(재고환원)', current_line_no: null, doc_type: 'outbound_request' },
        lines: [],
      },
      {
        doc: { status: 'in_review', remarks: null, current_line_no: 2, doc_type: 'draft_doc' },
        lines: [
          { line_no: 1, approver_role: 'approver', status: 'approved' },
          { line_no: 2, approver_role: 'approver', status: 'pending' },
        ],
      },
    ]
    for (const { doc, lines } of cases) {
      expect(adminDeleteConfirmStatusLabel(doc, lines)).toBe(getApprovalDocDetailedStatusLabel(doc, lines))
    }
  })

  it('uses first unified badge same as getUnifiedApprovalWorkflowBadges for non-remark overrides', () => {
    const doc = { status: 'submitted' as const, remarks: null, current_line_no: 1, doc_type: 'draft_doc' as const }
    const lines = [
      { line_no: 1, approver_role: 'approver', status: 'pending' },
      { line_no: 2, approver_role: 'approver', status: 'waiting' },
    ]
    const unified = getUnifiedApprovalWorkflowBadges(doc, lines)[0]?.label
    expect(adminDeleteConfirmStatusLabel(doc, lines)).toBe(unified)
    expect(getApprovalDocDetailedStatusPresentation(doc, lines).badges[0]?.label).toBe(unified)
  })
})

describe('formatApprovalProgressChain', () => {
  it('shows 임시저장 for draft', () => {
    expect(formatApprovalProgressChain({ status: 'draft', remarks: null, current_line_no: null }, [])).toBe('임시저장')
  })

  it('shows 기안회수 when draft with 회수 remarks', () => {
    expect(formatApprovalProgressChain({ status: 'draft', remarks: '기안 회수됨', current_line_no: null }, [])).toBe(
      '기안회수(상신취소·작성복귀)'
    )
  })

  it('chains 기안완료 with approver pending', () => {
    const s = formatApprovalProgressChain(
      { status: 'in_review', remarks: null, current_line_no: 2 },
      [
        { line_no: 1, status: 'approved', approver_role: 'reviewer', user_name: '이참조' },
        { line_no: 2, status: 'pending', approver_role: 'approver', user_name: '김영태' },
      ]
    )
    expect(s).toContain('기안완료')
    expect(s).toContain('이참조참조완료')
    expect(s).toContain('김영태결재대기중')
  })

  it('joins approver names for 결재라인', () => {
    expect(
      formatApproverLineNames([
        { line_no: 1, status: 'approved', approver_role: 'reviewer', user_name: '무시' },
        { line_no: 2, status: 'pending', approver_role: 'approver', user_name: '김영태' },
        { line_no: 3, status: 'waiting', approver_role: 'approver', user_name: '박형배' },
      ])
    ).toBe('김영태-박형배')
  })

  it('joins inbox 결재라인 as 기안자-결재(이름만)', () => {
    expect(
      formatInboxApproverLineDisplay('이기안', [
        { line_no: 1, status: 'pending', approver_role: 'approver', user_name: '김영태' },
      ])
    ).toBe('이기안-김영태')
    expect(formatInboxApproverLineDisplay('이기안', [])).toBe('이기안')
    expect(formatInboxApproverLineDisplay(null, [])).toBe('—')
  })
})

describe('getDocDetailOpenHref', () => {
  const base = { id: 10, doc_type: 'draft_doc' as const, remarks: null as string | null, current_line_no: null as number | null }

  it('기안자·반려면 통합함에서 작성(재상신) URL', () => {
    expect(getDocDetailOpenHref({ ...base, status: 'rejected', writer_id: 'u1' }, 'u1')).toBe('/approvals/new?resubmit=10')
  })

  it('기안자·draft면 작성 URL', () => {
    expect(getDocDetailOpenHref({ ...base, status: 'draft', writer_id: 'u1' }, 'u1')).toBe('/approvals/new?resubmit=10')
  })

  it('다른 사용자면 view URL', () => {
    expect(getDocDetailOpenHref({ ...base, status: 'rejected', writer_id: 'u1' }, 'u2')).toBe('/approvals/view/10')
  })

  it('대소문자 다른 writer_id/currentUserId도 동일 사용자로 판단한다', () => {
    expect(
      getDocDetailOpenHref(
        {
          ...base,
          status: 'rejected',
          writer_id: 'USER-ABC',
        },
        'user-abc'
      )
    ).toBe('/approvals/new?resubmit=10')
  })

  it('출고요청인데 outbound id 없으면 결재 view로 폴백', () => {
    expect(
      getDocDetailOpenHref(
        {
          ...base,
          id: 99,
          status: 'approved',
          doc_type: 'outbound_request',
          writer_id: 'other',
        },
        'u1'
      )
    ).toBe('/approvals/view/99')
  })

  it('출고요청 기안자·반려면 출고 재상신 URL로 열린다', () => {
    expect(
      getDocDetailOpenHref(
        {
          ...base,
          id: 88,
          doc_type: 'outbound_request',
          status: 'rejected',
          writer_id: 'writer-a',
          outbound_requests: { id: 3001 },
        },
        'writer-a'
      )
    ).toBe('/outbound-requests/new?resubmit=88')
  })

  it('출고요청이라도 비기안자면 출고 상세 view URL을 유지한다', () => {
    expect(
      getDocDetailOpenHref(
        {
          ...base,
          id: 77,
          doc_type: 'outbound_request',
          status: 'rejected',
          writer_id: 'writer-a',
          outbound_requests: { id: 900 },
        },
        'other-user'
      )
    ).toBe('/outbound-requests/view/900')
  })
})

describe('getOutboundRequestRowPresentation', () => {
  it('shows 출고 완료 when request is completed', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: { status: 'approved', remarks: null, current_line_no: null, doc_type: 'outbound_request' },
      lines: [],
      reqStatus: 'completed',
    })
    expect(p.label).toBe('출고완료')
  })

  it('shows cancellation relay when remarks indicate reverse relay', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: {
        status: 'approved',
        remarks: '결재자 취소완료',
        current_line_no: 1,
        doc_type: 'outbound_request',
      },
      lines: [],
      reqStatus: 'approved',
    })
    expect(p.label).toBe('취소 릴레이 진행')
  })

  it('shows 취소 완료 for cancelled request without approval doc', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: null,
      lines: [],
      reqStatus: 'cancelled',
    })
    expect(p.label).toBe('취소 완료')
  })

  it('shows 기안자 재고환원 대기 when remarks include 취소승인', () => {
    const p = getOutboundRequestRowPresentation({
      approvalDoc: {
        status: 'approved',
        remarks: '검토자 취소승인',
        current_line_no: 0,
        doc_type: 'outbound_request',
      },
      lines: [],
      reqStatus: 'approved',
    })
    expect(p.label).toBe('기안자 재고환원 대기')
  })

  it('shows 출고대기 / 진행중 by dispatch state', () => {
    const baseDoc = {
      status: 'approved' as const,
      remarks: null as string | null,
      current_line_no: null as number | null,
      doc_type: 'outbound_request' as const,
    }
    expect(
      getOutboundRequestRowPresentation({
        approvalDoc: baseDoc,
        lines: [],
        reqStatus: 'approved',
        dispatchState: 'queue',
      }).label
    ).toBe('출고대기')
    expect(
      getOutboundRequestRowPresentation({
        approvalDoc: baseDoc,
        lines: [],
        reqStatus: 'approved',
        dispatchState: 'assigned',
      }).label
    ).toBe('출고대기')
    expect(
      getOutboundRequestRowPresentation({
        approvalDoc: baseDoc,
        lines: [],
        reqStatus: 'approved',
        dispatchState: 'in_progress',
      }).label
    ).toBe('인수확인중')
  })
})

describe('getOutboundDispatchStatePresentation', () => {
  it('maps each dispatch state label consistently', () => {
    expect(getOutboundDispatchStatePresentation('queue').label).toBe('출고대기')
    expect(getOutboundDispatchStatePresentation('assigned').label).toBe('출고대기')
    expect(getOutboundDispatchStatePresentation('in_progress').label).toBe('인수확인중')
    expect(getOutboundDispatchStatePresentation('completed').label).toBe('출고완료')
    expect(getOutboundDispatchStatePresentation(null).label).toBe('출고대기')
  })
})
