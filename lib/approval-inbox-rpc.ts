/** `approval_inbox_query` RPC 응답 파싱·행 매핑 (통합결재문서함·대시보드 공통) */
import { getApprovalDocTypeRule } from '@/lib/approval-doc-type-rules'

export type InboxRpcItem = {
  id: number
  doc_no: string | null
  title: string | null
  status: string
  remarks: string | null
  drafted_at: string | null
  completed_at: string | null
  doc_type: string | null
  writer_id: string | null
  dept_id: number | null
  current_line_no: number | null
  approver_line_names: string
  writer_user_name: string | null
  dept_name: string | null
  outbound_request_id: number | null
}

export type InboxRpcPayload = {
  total: number
  items: InboxRpcItem[]
}

export function parseApprovalInboxRpcPayload(raw: unknown): InboxRpcPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const total = typeof o.total === 'number' ? o.total : Number(o.total)
  const items = Array.isArray(o.items) ? o.items : []
  if (!Number.isFinite(total)) return null
  return { total, items: items as InboxRpcItem[] }
}

/** 대시보드 카드용 최소 필드 (기존 `ApprovalDocRow`와 호환) */
export function mapInboxRpcItemToDashboardApprovalRow(row: InboxRpcItem): {
  id: number
  doc_no: string
  title: string
  status: string
  remarks: string | null
  current_line_no: number | null
  drafted_at: string
  doc_type: string | null
  writer_id: string | null
  outbound_requests: { id: number }[] | { id: number } | null
} {
  const rule = getApprovalDocTypeRule(row.doc_type)
  const outboundRef = row.outbound_request_id != null ? { id: Number(row.outbound_request_id) } : null
  return {
    id: row.id,
    doc_no: row.doc_no ?? '',
    title: row.title ?? '',
    status: row.status,
    remarks: row.remarks,
    current_line_no: row.current_line_no,
    drafted_at: row.drafted_at ?? '',
    doc_type: row.doc_type,
    writer_id: row.writer_id,
    /**
     * `outbound_request`인데 연결 id가 누락된 경우엔 null로 두고,
     * 상세 오픈 시 Rule 기반 URL 계산에서 결재문서 view로 안전 폴백한다.
     */
    outbound_requests:
      rule?.docType === 'outbound_request' && outboundRef == null ? null : outboundRef,
  }
}
