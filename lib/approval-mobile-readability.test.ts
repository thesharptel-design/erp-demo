import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ApprovalPageLayout from '@/components/approvals/ApprovalPageLayout'
import ApprovalInboxTableRow from '@/components/approvals/ApprovalInboxTableRow'
import OutboundRequestTableRow from '@/components/approvals/OutboundRequestTableRow'

describe('approval pages mobile readability regressions', () => {
  it('공용 레이아웃은 모바일 기본 패딩 + md 확장 패딩을 함께 유지한다', () => {
    const html = renderToStaticMarkup(
      createElement(
        ApprovalPageLayout,
        {
          title: '결재',
          description: '설명',
          actions: null,
          children: createElement('div', null, 'body'),
        }
      )
    )
    expect(html).toContain('p-4')
    expect(html).toContain('md:p-6')
  })

  it('통합함 행은 모바일/데스크톱 패딩·글자 클래스 쌍을 유지한다', () => {
    const html = renderToStaticMarkup(
      createElement(
        'table',
        null,
        createElement(
          'tbody',
          null,
          createElement(ApprovalInboxTableRow, {
            doc: {
              id: 11,
              doc_no: 'APP-11',
              title: '모바일 가독성 테스트',
              doc_type: 'draft_doc',
              status: 'submitted',
              remarks: null,
              current_line_no: null,
              drafted_at: '2026-04-29',
              hasLineOpinion: false,
              progressLabel: '기안완료',
              approverLineNames: '홍길동',
            },
            inboxViewerId: 'u1',
            typeLabel: '일반기안',
            draftDate: '2026-04-29',
            collapsedLine: '홍길동',
            activeProgress: '기안완료',
            pendingNames: [],
            statusBadges: [{ label: '결재,협조진행중', className: 'badge' }],
            expanded: false,
            onToggleExpanded: () => {},
            renderApproverLineWithPendingHighlight: (line: string) => line,
          })
        )
      )
    )
    expect(html).toContain('px-3 py-3')
    expect(html).toContain('md:px-4 md:py-4')
    expect(html).toContain('text-xs')
  })

  it('출고 문서함 행은 모바일에서 배지/텍스트 정보가 유지된다', () => {
    const html = renderToStaticMarkup(
      createElement(
        'table',
        null,
        createElement(
          'tbody',
          null,
          createElement(OutboundRequestTableRow, {
            request: {
              id: 3,
              req_no: 'REQ-3',
              req_date: '2026-04-29',
              requester_id: 'u1',
              customer_id: 1,
              purpose: '출고 목적',
              remarks: '비고',
              status: 'approved',
              approval_doc_id: 99,
              outbound_completed: false,
              dispatch_state: 'queue',
              dispatch_handler_user_id: null,
              dispatch_handler_name: '담당자',
              dispatch_assigned_at: null,
              dispatch_started_at: null,
              dispatch_completed_at: null,
              receipt_confirmed_at: null,
              receipt_confirmed_by: null,
              dispatch_last_actor_id: null,
              dispatch_last_action_at: null,
              warehouse_id: 1,
              created_at: '2026-04-29T00:00:00.000Z',
              updated_at: null,
              warehouses: { name: '본창고' },
              approval_doc: {
                status: 'approved',
                remarks: null,
                current_line_no: null,
                doc_type: 'outbound_request',
                approval_lines: [],
              },
            },
            requesterName: '요청자',
            customerName: '거래처',
            dispatchStateLabel: '지시 대기',
          })
        )
      )
    )
    expect(html).toContain('px-2 py-3')
    expect(html).toContain('md:py-4')
    expect(html).toContain('출고대기')
  })
})
