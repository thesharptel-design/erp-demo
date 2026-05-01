'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileCheck2, FilterX, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import TableFilterCombobox from '@/components/TableFilterCombobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import InlineAlertMirror from '@/components/InlineAlertMirror'
import ApprovalPageLayout from '@/components/approvals/ApprovalPageLayout'
import ApprovalInboxTableRow from '@/components/approvals/ApprovalInboxTableRow'
import {
  getApprovalDocTypeRule,
  getApprovalComposePopupWindowName,
} from '@/lib/approval-doc-type-rules'
import { openApprovalShellPopup } from '@/lib/approval-popup'
import {
  APPROVAL_INBOX_STATUS_FILTER_OPTIONS,
  formatApprovalProgressChain,
  formatInboxApproverLineDisplay,
  getApprovalDocDetailedStatusPresentation,
  getWriterName,
} from '@/lib/approval-status'
import type { ApprovalDocLike, ApprovalLineWithName } from '@/lib/approval-status'
import {
  hasOutboundPermission,
  isSystemAdminUser,
  type CurrentUserPermissions,
} from '@/lib/permissions'
import {
  type InboxRpcItem,
  parseApprovalInboxRpcPayload,
} from '@/lib/approval-inbox-rpc'

type OutboundInboxDocRow = ApprovalDocLike & {
  id: number
  writer_id: string | null
  dept_id: number | null
  doc_no: string | null
  title: string | null
  drafted_at: string | null
  completed_at?: string | null
  recent_reject_comment?: string | null
  hasLineOpinion: boolean
  linesForStatusPresentation: Array<{ line_no: number; approver_role: string; status: string }>
  app_users?: { user_name?: string } | { user_name?: string }[] | null
  departments?: { dept_name?: string } | { dept_name?: string }[] | null
  progressLabel: string
  approverLineNames: string
  dispatch_state?: 'queue' | 'assigned' | 'in_progress' | 'completed' | null
  receipt_confirmed_at?: string | null
}

type ReceiptCertificatePayload = {
  request: {
    id: number
    req_no: string | null
    requester_id: string
    created_at?: string | null
    purpose?: string | null
    remarks?: string | null
    dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed' | null
    dispatch_handler_name: string | null
    requester_name?: string | null
    receipt_confirmed_at: string | null
    receipt_confirmed_by: string | null
    receipt_confirmed_by_name?: string | null
  }
  items: Array<{
    id: number
    line_no: number | null
    qty: number
    item_code: string | null
    item_name: string | null
    lot: string | null
    sn: string | null
    exp: string | null
  }>
  can_confirm: boolean
}

const OUTBOUND_DRAFT_COMPOSE_HREF =
  getApprovalDocTypeRule('outbound_request')?.composeHref ?? '/outbound-requests/new'
const OUTBOUND_DRAFT_COMPOSE_WINDOW_NAME = getApprovalComposePopupWindowName('outbound_request')

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const COMBO_EMPTY = [{ value: '', label: '전체' }]
const REJECT_HISTORY_ACTIONS = ['reject', 'reject_direct', 'reject_sequential', 'reject_targeted'] as const
const OPINION_HISTORY_ACTIONS = [
  'approve',
  'reject',
  'reject_direct',
  'reject_sequential',
  'reject_targeted',
  'approve_revoke',
  'cancel_request',
  'cancel_relay',
  'cancel_requested_by_writer',
  'direct_cancel_final',
  'confirm_pre_cooperation',
  'confirm_post_cooperation',
  'override_approve',
] as const

function mapRpcRowToDoc(
  row: InboxRpcItem
): Omit<
  OutboundInboxDocRow,
  'progressLabel' | 'approverLineNames' | 'recent_reject_comment' | 'hasLineOpinion' | 'linesForStatusPresentation'
> {
  const rule = getApprovalDocTypeRule(row.doc_type)
  const outboundRef = row.outbound_request_id != null ? { id: Number(row.outbound_request_id) } : null

  return {
    id: row.id,
    doc_no: row.doc_no,
    title: row.title,
    status: row.status,
    remarks: row.remarks,
    drafted_at: row.drafted_at,
    completed_at: row.completed_at,
    doc_type: row.doc_type,
    writer_id: row.writer_id,
    dept_id: row.dept_id,
    current_line_no: row.current_line_no,
    content: null,
    outbound_requests:
      rule?.docType === 'outbound_request' && outboundRef == null ? null : outboundRef,
    app_users: row.writer_user_name ? { user_name: row.writer_user_name } : null,
    departments: row.dept_name ? { dept_name: row.dept_name } : null,
  }
}

export default function OutboundRequestsPage() {
  const [docs, setDocs] = useState<OutboundInboxDocRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false)
  const [inboxViewerId, setInboxViewerId] = useState<string | null>(null)
  const [isPermissionDenied, setIsPermissionDenied] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20)
  const [expandedApproverLineDocId, setExpandedApproverLineDocId] = useState<number | null>(null)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptSubmitting, setReceiptSubmitting] = useState(false)
  const [receiptPayload, setReceiptPayload] = useState<ReceiptCertificatePayload | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [receiptExtraNote, setReceiptExtraNote] = useState('')

  const [filterDocNo, setFilterDocNo] = useState('')
  const [filterTitle, setFilterTitle] = useState('')
  const [filterApproverLine, setFilterApproverLine] = useState('')
  const [filterProgress, setFilterProgress] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDraftDate, setFilterDraftDate] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const setFilterDocNoP = useCallback((v: string) => {
    setFilterDocNo(v)
    setPage(1)
  }, [])
  const setFilterTitleP = useCallback((v: string) => {
    setFilterTitle(v)
    setPage(1)
  }, [])
  const setFilterApproverLineP = useCallback((v: string) => {
    setFilterApproverLine(v)
    setPage(1)
  }, [])
  const setFilterProgressP = useCallback((v: string) => {
    setFilterProgress(v)
    setPage(1)
  }, [])
  const setFilterStatusP = useCallback((v: string) => {
    setFilterStatus(v)
    setPage(1)
  }, [])
  const setFilterDraftDateP = useCallback((v: string) => {
    setFilterDraftDate(v)
    setPage(1)
  }, [])

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)
      setIsPermissionDenied(false)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setInboxViewerId(null)
        setDocs([])
        setTotalCount(0)
        return
      }
      setInboxViewerId(user.id)

      const { data: profile } = await supabase
        .from('app_users')
        .select(`
          role_name,
          can_manage_permissions,
          can_admin_manage,
          outbound_role,
          can_outbound_view,
          can_outbound_execute_self,
          can_outbound_assign_handler,
          can_outbound_reassign_recall,
          can_outbound_execute_any
        `)
        .eq('id', user.id)
        .single()

      const userIsAdmin = isSystemAdminUser(
        profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
      )
      const userCanOutboundView = hasOutboundPermission(
        profile as Partial<
          Pick<
            CurrentUserPermissions,
            | 'role_name'
            | 'can_manage_permissions'
            | 'can_admin_manage'
            | 'outbound_role'
            | 'can_outbound_view'
            | 'can_outbound_execute_self'
            | 'can_outbound_assign_handler'
            | 'can_outbound_reassign_recall'
            | 'can_outbound_execute_any'
          >
        >,
        'can_outbound_view'
      )
      setViewerIsAdmin(userIsAdmin)
      if (!userCanOutboundView) {
        setIsPermissionDenied(true)
        setDocs([])
        setTotalCount(0)
        return
      }

      const draftDateRaw = filterDraftDate.trim()
      const pDraftDate =
        draftDateRaw.length >= 8 && /^\d{4}-\d{2}-\d{2}$/.test(draftDateRaw) ? draftDateRaw : null
      const { data: rawPayload, error } = await supabase.rpc('approval_inbox_query', {
        p_doc_no: filterDocNo.trim() || null,
        p_doc_type: 'outbound_request',
        p_title: filterTitle.trim() || null,
        p_draft_date: pDraftDate,
        p_approver_line: filterApproverLine.trim() || null,
        p_progress: filterProgress.trim() || null,
        p_status: filterStatus.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })

      if (error) {
        setFetchError(error.message)
        setDocs([])
        setTotalCount(0)
        return
      }

      const payload = parseApprovalInboxRpcPayload(rawPayload)
      if (!payload) {
        setFetchError('목록 응답 형식이 올바르지 않습니다.')
        setDocs([])
        setTotalCount(0)
        return
      }

      setTotalCount(payload.total)
      const loadedBase = payload.items.map(mapRpcRowToDoc)
      const docIds = loadedBase.map((d) => d.id)
      if (docIds.length === 0) {
        setDocs([])
        return
      }

      const [{ data: rejectedRows }, { data: rejectedHistoryRows }, { data: opinionHistoryRowsRaw }, { data: rawLines }] =
        await Promise.all([
          supabase
            .from('approval_lines')
            .select('approval_doc_id, opinion, acted_at')
            .in('approval_doc_id', docIds)
            .eq('status', 'rejected')
            .not('opinion', 'is', null)
            .order('acted_at', { ascending: false }),
          supabase
            .from('approval_histories')
            .select('approval_doc_id, action_comment, action_at')
            .in('approval_doc_id', docIds)
            .in('action_type', [...REJECT_HISTORY_ACTIONS])
            .not('action_comment', 'is', null)
            .order('action_at', { ascending: false }),
          supabase
            .from('approval_histories')
            .select('approval_doc_id, action_comment, action_type')
            .in('approval_doc_id', docIds)
            .in('action_type', [...OPINION_HISTORY_ACTIONS])
            .not('action_comment', 'is', null),
          supabase
            .from('approval_lines')
            .select('approval_doc_id, line_no, status, approver_role, approver_id, opinion')
            .in('approval_doc_id', docIds),
        ])
      const outboundIds = payload.items
        .map((row) => row.outbound_request_id)
        .filter((value): value is number => Number.isFinite(Number(value)))
      const outboundStateMap = new Map<
        number,
        { dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed' | null; receipt_confirmed_at: string | null }
      >()
      if (outboundIds.length > 0) {
        const { data: outboundRows } = await supabase
          .from('outbound_requests')
          .select('id, dispatch_state, receipt_confirmed_at')
          .in('id', outboundIds)
        for (const row of outboundRows ?? []) {
          outboundStateMap.set(Number(row.id), {
            dispatch_state: (row.dispatch_state as 'queue' | 'assigned' | 'in_progress' | 'completed' | null) ?? null,
            receipt_confirmed_at: row.receipt_confirmed_at ?? null,
          })
        }
      }

      const rejectCommentMap = new Map<number, string>()
      for (const row of (rejectedHistoryRows ?? []) as { approval_doc_id: number; action_comment: string | null }[]) {
        if (!row.approval_doc_id || !row.action_comment) continue
        if (rejectCommentMap.has(row.approval_doc_id)) continue
        rejectCommentMap.set(row.approval_doc_id, row.action_comment)
      }
      for (const row of (rejectedRows ?? []) as { approval_doc_id: number; opinion: string | null }[]) {
        if (!row.approval_doc_id || !row.opinion) continue
        if (rejectCommentMap.has(row.approval_doc_id)) continue
        rejectCommentMap.set(row.approval_doc_id, row.opinion)
      }

      const opinionHistoryRows = (opinionHistoryRowsRaw ?? []) as {
        approval_doc_id: number
        action_comment: string | null
        action_type: string | null
      }[]
      const lineRows = (rawLines ?? []) as {
        approval_doc_id: number
        line_no: number
        status: string
        approver_role: string
        approver_id: string
        opinion?: string | null
      }[]
      const hasOpinionByDoc = new Map<number, boolean>()
      for (const row of lineRows) {
        if (String(row.opinion ?? '').trim()) hasOpinionByDoc.set(row.approval_doc_id, true)
      }
      for (const row of opinionHistoryRows) {
        const comment = String(row.action_comment ?? '').trim()
        if (!comment || comment === '[-]') continue
        if (comment === '기안서 상신' || comment === '출고요청 상신' || comment === '출고요청 재상신') continue
        if (comment.includes('재상신')) continue
        if (String(row.action_type ?? '').trim() === '') continue
        hasOpinionByDoc.set(row.approval_doc_id, true)
      }

      const approverIds = [...new Set(lineRows.map((r) => r.approver_id).filter(Boolean))]
      const nameMap = new Map<string, string>()
      if (approverIds.length > 0) {
        const { data: nameRows } = await supabase.from('app_users').select('id, user_name').in('id', approverIds)
        for (const row of nameRows ?? []) {
          if (row.id) nameMap.set(row.id, row.user_name ?? '')
        }
      }

      const linesByDoc = new Map<number, ApprovalLineWithName[]>()
      for (const row of lineRows) {
        const list = linesByDoc.get(row.approval_doc_id) ?? []
        list.push({
          line_no: row.line_no,
          status: row.status,
          approver_role: row.approver_role,
          user_name: nameMap.get(row.approver_id) ?? '',
        })
        linesByDoc.set(row.approval_doc_id, list)
      }

      const rpcLineById = new Map(payload.items.map((r) => [r.id, r.approver_line_names]))

      setDocs(
        loadedBase.map((doc) => {
          const lines = linesByDoc.get(doc.id) ?? []
          const writerLabel = getWriterName(doc.app_users)
          const writerForLine = writerLabel === '-' ? null : writerLabel
          const rpcRaw = (rpcLineById.get(doc.id) ?? '').trim()
          const rpcApprovers = rpcRaw && rpcRaw !== '-' ? rpcRaw : ''
          const writerSeg = formatInboxApproverLineDisplay(writerForLine, [])
          const approverLineNames =
            lines.length > 0
              ? formatInboxApproverLineDisplay(writerForLine, lines)
              : rpcApprovers
                ? `${writerSeg}-${rpcApprovers}`
                : writerSeg
          return {
            ...doc,
            recent_reject_comment: rejectCommentMap.get(doc.id) ?? null,
            hasLineOpinion: hasOpinionByDoc.get(doc.id) ?? false,
            linesForStatusPresentation: lines.map((l) => ({
              line_no: l.line_no,
              approver_role: l.approver_role,
              status: l.status,
            })),
            progressLabel: formatApprovalProgressChain(doc as OutboundInboxDocRow, lines),
            approverLineNames,
            dispatch_state:
              doc.outbound_requests && !Array.isArray(doc.outbound_requests)
                ? outboundStateMap.get(doc.outbound_requests.id)?.dispatch_state ?? null
                : null,
            receipt_confirmed_at:
              doc.outbound_requests && !Array.isArray(doc.outbound_requests)
                ? outboundStateMap.get(doc.outbound_requests.id)?.receipt_confirmed_at ?? null
                : null,
          }
        })
      )
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
      setDocs([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [
    filterApproverLine,
    filterDocNo,
    filterDraftDate,
    filterProgress,
    filterStatus,
    filterTitle,
    page,
    pageSize,
  ])

  useEffect(() => {
    void fetchInbox()
  }, [fetchInbox])

  const clearFilters = useCallback(() => {
    setFilterDocNo('')
    setFilterTitle('')
    setFilterApproverLine('')
    setFilterProgress('')
    setFilterStatus('')
    setFilterDraftDate('')
    setPage(1)
  }, [])

  const handleRefresh = useCallback(() => {
    clearFilters()
    setPage(1)
    void fetchInbox()
  }, [clearFilters, fetchInbox])

  const openOutboundDraftPopup = useCallback(() => {
    openApprovalShellPopup(OUTBOUND_DRAFT_COMPOSE_HREF, OUTBOUND_DRAFT_COMPOSE_WINDOW_NAME)
  }, [])

  const openReceiptCertificate = useCallback(async (outboundRequestId: number) => {
    try {
      setReceiptDialogOpen(true)
      setReceiptLoading(true)
      setReceiptError(null)
      setReceiptPayload(null)
      setReceiptExtraNote('')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
      const response = await fetch(`/api/outbound-requests/receipt-confirm?outbound_request_id=${outboundRequestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String((payload as { error?: string }).error ?? '인수확인증을 불러오지 못했습니다.'))
      setReceiptPayload(payload as ReceiptCertificatePayload)
    } catch (e: unknown) {
      setReceiptError(e instanceof Error ? e.message : '인수확인증을 불러오지 못했습니다.')
    } finally {
      setReceiptLoading(false)
    }
  }, [])

  const confirmReceipt = useCallback(async () => {
    if (!receiptPayload?.request?.id) return
    try {
      setReceiptSubmitting(true)
      setReceiptError(null)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
      const response = await fetch('/api/outbound-requests/receipt-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ outbound_request_id: receiptPayload.request.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String((payload as { error?: string }).error ?? '수령확인 처리에 실패했습니다.'))
      const confirmedAt = String((payload as { confirmed_at?: string }).confirmed_at ?? '')
      const confirmedBy = String((payload as { confirmed_by?: string }).confirmed_by ?? '')
      const confirmedByName = String((payload as { confirmed_by_name?: string | null }).confirmed_by_name ?? '').trim()
      setReceiptPayload((prev) =>
        prev
          ? {
              ...prev,
              request: {
                ...prev.request,
                receipt_confirmed_at: confirmedAt || prev.request.receipt_confirmed_at,
                receipt_confirmed_by: confirmedBy || prev.request.receipt_confirmed_by,
                receipt_confirmed_by_name: confirmedByName || prev.request.receipt_confirmed_by_name || null,
              },
              can_confirm: false,
            }
          : prev
      )
      alert('수령확인이 완료되었습니다.')
      await fetchInbox()
    } catch (e: unknown) {
      setReceiptError(e instanceof Error ? e.message : '수령확인 처리에 실패했습니다.')
    } finally {
      setReceiptSubmitting(false)
    }
  }, [fetchInbox, receiptPayload?.request?.id])

  const printReceiptCertificate = useCallback(() => {
    if (!receiptPayload) return
    const printWindow = window.open('', '_blank', 'width=980,height=760')
    if (!printWindow) {
      alert('팝업이 차단되어 출력창을 열 수 없습니다.')
      return
    }
    const req = receiptPayload.request
    const issuedDate = String(req.created_at ?? '').replace('T', ' ').slice(0, 19) || '-'
    const confirmedDate = String(req.receipt_confirmed_at ?? '').replace('T', ' ').slice(0, 19) || '-'
    const purpose = String(req.purpose ?? '').trim() || '-'
    const remarks = String(req.remarks ?? '').trim() || '-'
    const extra = receiptExtraNote.trim() || '-'
    const hasLot = receiptPayload.items.some((row) => Boolean(String(row.lot ?? '').trim()))
    const hasSn = receiptPayload.items.some((row) => Boolean(String(row.sn ?? '').trim()))
    const hasExp = receiptPayload.items.some((row) => Boolean(String(row.exp ?? '').trim()))
    const tableHeader = `
      <tr>
        <th>No.</th><th>품목코드</th><th>품목명</th>
        ${hasLot ? '<th>LOT</th>' : ''}
        ${hasSn ? '<th>SN</th>' : ''}
        ${hasExp ? '<th>EXP</th>' : ''}
        <th>수량</th>
      </tr>
    `
    const rows = receiptPayload.items
      .map(
        (row, idx) => `
          <tr>
            <td>${row.line_no ?? idx + 1}</td>
            <td>${row.item_code ?? '-'}</td>
            <td>${row.item_name ?? '-'}</td>
            ${hasLot ? `<td>${row.lot ?? '-'}</td>` : ''}
            ${hasSn ? `<td>${row.sn ?? '-'}</td>` : ''}
            ${hasExp ? `<td>${row.exp ?? '-'}</td>` : ''}
            <td style="text-align:right;">${row.qty}</td>
          </tr>`
      )
      .join('')
    const outboundHandlerName = String(req.dispatch_handler_name ?? '미지정').trim() || '미지정'
    const receiverName = String(req.requester_name ?? req.requester_id ?? '수령자').trim() || '수령자'
    const confirmedByName = String(req.receipt_confirmed_by_name ?? req.receipt_confirmed_by ?? receiverName).trim() || receiverName
    const receiverSignature = req.receipt_confirmed_at
      ? `
      <span class="receiver-name">${receiverName}</span>
      <span class="stamp">${receiverName}</span>
    `
      : `<span class="receiver-name">${receiverName}</span>`
    printWindow.document.write(`
      <html>
      <head>
        <title>인수확인증</title>
        <style>
          body { font-family: "Malgun Gothic", Arial, sans-serif; color:#111; padding:24px; }
          .paper { border:2px solid #111; padding:20px; }
          .title { text-align:center; font-size:28px; font-weight:800; letter-spacing:2px; margin-bottom:16px; }
          .meta, .meta2 { border:1px solid #999; padding:10px 12px; margin-bottom:8px; font-weight:700; line-height:1.6; }
          table { width:100%; border-collapse:collapse; margin-top:8px; }
          th, td { border:1px solid #999; padding:8px; font-size:14px; }
          th { background:#f3f4f6; }
          .sign { margin-top:18px; display:flex; justify-content:space-between; align-items:stretch; gap: 12px; }
          .receiver-signature { display:inline-flex; align-items:center; gap:8px; min-height:28px; }
          .receiver-name { font-size:16px; font-weight:800; color:#111; }
          .stamp { display:inline-flex; align-items:center; justify-content:center; width:60px; height:60px; border:2px solid #dc2626; color:#dc2626; border-radius:999px; font-size:12px; font-weight:900; transform:rotate(-12deg); }
          .stamp-meta { margin-top:6px; font-size:11px; font-weight:700; color:#374151; }
          .sign-box { flex:1; border:1px solid #999; min-height:76px; padding:8px; display:flex; flex-direction:column; }
          .sign-title { font-size:12px; font-weight:800; margin-bottom:10px; }
          .sign-line { border-bottom:1px solid #444; height:24px; margin-top:auto; }
          .sign-name { margin-bottom:6px; font-size:14px; font-weight:800; color:#111; min-height:28px; display:inline-flex; align-items:center; gap:8px; }
        </style>
      </head>
      <body>
        <div class="paper">
          <div class="title">인 수 확 인 증</div>
          <div class="meta">문서번호: ${req.req_no ?? '-'} / 발행일: ${issuedDate} / 출고담당자: ${req.dispatch_handler_name ?? '미지정'} / 수령자: ${req.requester_name ?? req.requester_id}</div>
          <div class="meta2">출고목적: ${purpose}</div>
          <div class="meta2">기타내용(출력메모): ${extra}</div>
          <div class="meta2">비고: ${remarks}</div>
          <table>
            <thead>${tableHeader}</thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;">품목 없음</td></tr>'}</tbody>
          </table>
          <div class="sign">
            <div class="sign-box">
              <div class="sign-title">출고담당자 서명</div>
              <div class="sign-name">${outboundHandlerName}</div>
              <div class="sign-line"></div>
            </div>
            <div class="sign-box">
              <div class="sign-title">수령자 서명</div>
              <div class="sign-name receiver-signature">${receiverSignature}</div>
              <div class="sign-line"></div>
              <div class="stamp-meta">${req.receipt_confirmed_at ? `${confirmedByName} / ${confirmedDate}` : '수령확인 전'}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }, [receiptExtraNote, receiptPayload])

  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, totalCount)
  const colCount = 6

  const hintOptions = useMemo(() => {
    const uniqStrings = (pick: (d: OutboundInboxDocRow) => string) =>
      [...new Set(docs.map((d) => pick(d)).filter(Boolean))].slice(0, 40)
    return {
      docNo: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => String(d.doc_no ?? '').trim())
          .filter(Boolean)
          .map((v) => ({ value: v, label: v })),
      ],
      title: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => String(d.title ?? '').trim())
          .filter(Boolean)
          .map((v) => ({ value: v, label: v.length > 80 ? `${v.slice(0, 80)}…` : v })),
      ],
      line: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => d.approverLineNames)
          .filter((s) => s && s !== '-')
          .map((v) => ({ value: v, label: v })),
      ],
      progress: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => d.progressLabel)
          .filter(Boolean)
          .map((v) => ({ value: v, label: v.length > 100 ? `${v.slice(0, 100)}…` : v })),
      ],
    }
  }, [docs])

  const stripDraftCompletePrefix = useCallback((progress: string) => {
    return progress
      .replace(/기안완료(?:\s*[>,/|·]\s*|\s*)/gu, '')
      .replace(/[>＞›»→▶▸•·]/g, ' ')
      .replace(/^[>,/|·\s]+/u, '')
      .replace(/^-\s*/u, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }, [])

  const getPendingActorNames = useCallback((progress: string) => {
    const cleaned = stripDraftCompletePrefix(progress)
    const names: string[] = []
    const regex = /([^\s]+?)(?:결재대기중|협조대기중|대기중|결재중|협조중)/g
    let m: RegExpExecArray | null = null
    while ((m = regex.exec(cleaned)) !== null) {
      const name = String(m[1] ?? '').trim()
      if (name) names.push(name)
    }
    return [...new Set(names)]
  }, [stripDraftCompletePrefix])

  const getCollapsedApproverLineText = useCallback((line: string, pendingName?: string | null) => {
    const value = line.trim()
    if (!value) return '-'
    if (pendingName) {
      const parts = value.split('-').map((p) => p.trim()).filter(Boolean)
      const first = parts[0] ?? pendingName
      if (parts.length >= 2) return `${first}-${pendingName}...`
      return `${pendingName}...`
    }
    const parts = value.split('-').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) return `${parts[0]}-...`
    if (value.length <= 8) return value
    return `${value.slice(0, 8)}...`
  }, [])

  const keepOnlyActiveProgress = useCallback((progress: string) => {
    const noDraft = stripDraftCompletePrefix(progress)
    const activeOnly = noDraft
      .replace(/[^\s]+(?:결재완료|협조완료)\s*/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return activeOnly || noDraft
  }, [stripDraftCompletePrefix])

  const renderApproverLineWithPendingHighlight = useCallback((line: string, pendingNames: string[]) => {
    if (!pendingNames.length) return line
    const unique = [...new Set(pendingNames.filter(Boolean))]
    if (!unique.length) return line
    const escaped = unique.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
    const parts = line.split(pattern)
    return parts.map((part, idx) =>
      unique.includes(part) ? (
        <span key={`${part}-${idx}`} className="font-semibold text-blue-600">
          {part}
        </span>
      ) : (
        <span key={`text-${idx}`}>{part}</span>
      )
    )
  }, [])

  return (
    <ApprovalPageLayout
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          출고결재문서함
          {viewerIsAdmin ? (
            <Badge
              variant="outline"
              className="border-violet-300 bg-violet-50 text-[11px] font-semibold uppercase tracking-wide text-violet-800"
              title="시스템 관리자 계정으로 조직 전체 문서를 조회 중입니다."
            >
              관리자 · 전체 문서
            </Badge>
          ) : null}
        </span>
      }
      description={
        <>
          <span>
            {viewerIsAdmin
              ? '관리자는 출고결재 문서를 조직 전체 기준으로 조회할 수 있습니다.'
              : '출고결재 중 기안했거나 결재·참조·협조 결재선에 포함된 문서가 표시됩니다.'}
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            필터·페이지·건수는 서버에서 계산됩니다.
          </span>
        </>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={openOutboundDraftPopup} disabled={isPermissionDenied}>
            출고 요청 작성
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleRefresh}>
            새로고침
          </Button>
        </div>
      }
    >
      {isPermissionDenied ? (
        <InlineAlertMirror message="출고요청 조회 권한이 없습니다. 관리자에게 출고권한(조회)을 요청해 주세요." variant="error" />
      ) : null}
      {fetchError ? <InlineAlertMirror message={fetchError} variant="error" /> : null}

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground md:text-sm">
              {!loading ? (
                <span>
                  전체 <span className="font-semibold text-foreground">{totalCount}</span>건 · {rangeStart}-{rangeEnd}
                  번째 표시 · {safePage}/{totalPages} 페이지
                </span>
              ) : (
                <span>불러오는 중…</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              title="필터 초기화"
              aria-label="필터 초기화"
              onClick={clearFilters}
            >
              <FilterX className="size-3.5" aria-hidden />
            </Button>
          </div>

          <div className="flex min-h-[min(60vh,32rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm text-card-foreground">
                <colgroup>
                  <col className="w-[15rem]" />
                  <col className="w-[20rem]" />
                  <col className="w-[8.75rem]" />
                  <col className="w-[10.5rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[6.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">문서번호</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">제목</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">결재라인</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">순번</span>
                    </th>
                    <th className="px-2 py-3 text-center md:px-3">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">상태</span>
                    </th>
                    <th className="px-2 py-3 md:px-3">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">기안일</span>
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                    <th className="relative z-[2] px-2 py-2 align-top">
                      <TableFilterCombobox
                        value={filterDocNo}
                        onChange={setFilterDocNoP}
                        options={hintOptions.docNo.length > 1 ? hintOptions.docNo : COMBO_EMPTY}
                        placeholder="문서번호 (서버 검색)"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                        dropdownPlacement="auto"
                      />
                    </th>
                    <th className="relative z-[2] px-2 py-2 align-top">
                      <TableFilterCombobox
                        value={filterTitle}
                        onChange={setFilterTitleP}
                        options={hintOptions.title.length > 1 ? hintOptions.title : COMBO_EMPTY}
                        placeholder="제목 (서버 검색)"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                        dropdownPlacement="auto"
                      />
                    </th>
                    <th className="relative z-[2] px-2 py-2 align-top">
                      <TableFilterCombobox
                        value={filterApproverLine}
                        onChange={setFilterApproverLineP}
                        options={hintOptions.line.length > 1 ? hintOptions.line : COMBO_EMPTY}
                        placeholder="결재자 (서버 검색)"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                        dropdownPlacement="auto"
                      />
                    </th>
                    <th className="relative z-[2] px-2 py-2 align-top">
                      <TableFilterCombobox
                        value={filterProgress}
                        onChange={setFilterProgressP}
                        options={hintOptions.progress.length > 1 ? hintOptions.progress : COMBO_EMPTY}
                        placeholder="진행 (비고·결재선)"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                        dropdownPlacement="auto"
                      />
                    </th>
                    <th className="relative z-[2] px-1 py-2 align-top">
                      <TableFilterCombobox
                        value={filterStatus}
                        onChange={setFilterStatusP}
                        options={[...APPROVAL_INBOX_STATUS_FILTER_OPTIONS]}
                        placeholder="상태 (코드·비고)"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 text-[11px] font-bold py-1.5 px-1.5"
                        dropdownClassName="min-w-[9rem] text-xs"
                        dropdownPlacement="auto"
                      />
                    </th>
                    <th className="relative z-[2] px-2 py-2 align-top">
                      <TableFilterCombobox
                        value={filterDraftDate}
                        onChange={setFilterDraftDateP}
                        options={COMBO_EMPTY}
                        placeholder="YYYY-MM-DD"
                        creatable
                        showClearOption={false}
                        listMaxHeightClass="max-h-56 overflow-y-auto"
                        buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                        dropdownPlacement="auto"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="min-h-[48vh] align-middle p-12 text-center text-sm font-medium text-muted-foreground"
                      >
                        데이터 로딩 중…
                      </td>
                    </tr>
                  ) : docs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="min-h-[48vh] align-middle p-12 text-center text-sm font-medium text-muted-foreground"
                      >
                        문서가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    docs.map((doc) => {
                      const pres = getApprovalDocDetailedStatusPresentation(doc, doc.linesForStatusPresentation)
                      const draftDate = doc.drafted_at?.slice(0, 10) ?? ''
                      const pendingNames = getPendingActorNames(doc.progressLabel)
                      const collapsedLine = getCollapsedApproverLineText(doc.approverLineNames)
                      const activeProgress = keepOnlyActiveProgress(doc.progressLabel)
                      return (
                        <ApprovalInboxTableRow
                          key={doc.id}
                          doc={doc}
                          inboxViewerId={inboxViewerId}
                          typeLabel=""
                          showTypeColumn={false}
                          draftDate={draftDate}
                          collapsedLine={collapsedLine}
                          activeProgress={activeProgress}
                          pendingNames={pendingNames}
                          statusBadges={pres.badges}
                          expanded={expandedApproverLineDocId === doc.id}
                          onToggleExpanded={(docId) =>
                            setExpandedApproverLineDocId((prev) => (prev === docId ? null : docId))
                          }
                          renderApproverLineWithPendingHighlight={renderApproverLineWithPendingHighlight}
                          docNoTrailingAction={
                            doc.outbound_requests && !Array.isArray(doc.outbound_requests) ? (
                              (() => {
                                const outboundRequest = Array.isArray(doc.outbound_requests) ? null : doc.outbound_requests
                                if (!outboundRequest) return null
                                const isConfirmed = Boolean(doc.receipt_confirmed_at)
                                const isPending = doc.dispatch_state === 'in_progress' && !isConfirmed
                                const baseClass =
                                  'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-black'
                                const className = isConfirmed
                                  ? `${baseClass} border-emerald-400 bg-emerald-100 text-emerald-800 hover:bg-emerald-200`
                                  : isPending
                                    ? `${baseClass} border-indigo-400 bg-indigo-100 text-indigo-800 hover:bg-indigo-200`
                                    : `${baseClass} border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200`
                                return (
                                  <button
                                    type="button"
                                    onClick={() => void openReceiptCertificate(outboundRequest.id)}
                                    className={className}
                                    title={
                                      isConfirmed
                                        ? '수령완료 (인수확인증/출력 가능)'
                                        : isPending
                                          ? '수령확인 진행 가능'
                                          : '인수확인증/출력 미리보기 가능'
                                    }
                                    aria-label="인수확인증 열기"
                                  >
                                    <FileCheck2 className="size-3" />
                                    {isConfirmed ? '수령완료' : '수령확인'}
                                  </button>
                                )
                              })()
                            ) : null
                          }
                        />
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && totalCount > 0 ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
                <span>페이지당</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                    setPage(1)
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="페이지당 행 수"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}건
                    </option>
                  ))}
                </select>
                <span>
                  · 전체 <span className="font-semibold text-foreground">{totalCount}</span>건 ·{' '}
                  <span className="font-semibold text-foreground">{safePage}</span> / {totalPages} 페이지
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  다음
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-hidden p-0">
          <div className="flex max-h-[92vh] flex-col overflow-hidden p-6">
          <DialogHeader>
            <DialogTitle className="font-black">인수확인증</DialogTitle>
            <DialogDescription>
              요청자 확인 후 출고완료가 가능합니다.
            </DialogDescription>
          </DialogHeader>
          {receiptLoading ? (
            <p className="text-sm font-semibold text-muted-foreground">불러오는 중…</p>
          ) : receiptError ? (
            <InlineAlertMirror message={receiptError} variant="error" />
          ) : receiptPayload ? (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-slate-800 bg-white p-4">
                <p className="text-center text-xl font-black tracking-[0.2em]">인 수 확 인 증</p>
                <div className="mt-3 rounded-md border border-slate-300 bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-700">
                  <div className="break-words">문서번호: {receiptPayload.request.req_no || '-'}</div>
                  <div className="break-words">출고담당자: {receiptPayload.request.dispatch_handler_name || '미지정'}</div>
                  <div className="break-words">수령자: {receiptPayload.request.requester_name || receiptPayload.request.requester_id}</div>
                </div>
              </div>
              <div className="max-h-[28vh] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-2 font-black">No.</th>
                      <th className="px-2 py-2 font-black">품목코드</th>
                      <th className="px-2 py-2 font-black">품목명</th>
                      {receiptPayload.items.some((row) => Boolean(String(row.lot ?? '').trim())) ? (
                        <th className="px-2 py-2 font-black">LOT</th>
                      ) : null}
                      {receiptPayload.items.some((row) => Boolean(String(row.sn ?? '').trim())) ? (
                        <th className="px-2 py-2 font-black">SN</th>
                      ) : null}
                      {receiptPayload.items.some((row) => Boolean(String(row.exp ?? '').trim())) ? (
                        <th className="px-2 py-2 font-black">EXP</th>
                      ) : null}
                      <th className="px-2 py-2 text-right font-black">수량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {receiptPayload.items.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="px-2 py-2 font-semibold text-slate-600">{row.line_no ?? idx + 1}</td>
                        <td className="px-2 py-2 font-black text-blue-700">{row.item_code ?? '-'}</td>
                        <td className="px-2 py-2 font-semibold">{row.item_name ?? '-'}</td>
                        {receiptPayload.items.some((r) => Boolean(String(r.lot ?? '').trim())) ? (
                          <td className="px-2 py-2 font-semibold">{row.lot ?? '-'}</td>
                        ) : null}
                        {receiptPayload.items.some((r) => Boolean(String(r.sn ?? '').trim())) ? (
                          <td className="px-2 py-2 font-semibold">{row.sn ?? '-'}</td>
                        ) : null}
                        {receiptPayload.items.some((r) => Boolean(String(r.exp ?? '').trim())) ? (
                          <td className="px-2 py-2 font-semibold">{row.exp ?? '-'}</td>
                        ) : null}
                        <td className="px-2 py-2 text-right font-black">{row.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {receiptPayload.request.receipt_confirmed_at ? (
                <div className="flex items-end justify-end">
                  <div className="text-right">
                    <div className="inline-flex h-20 w-20 rotate-[-12deg] items-center justify-center rounded-full border-[3px] border-red-600 px-1 text-center text-sm font-black text-red-600">
                      {receiptPayload.request.requester_name || receiptPayload.request.requester_id || '수령자'}
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-emerald-700">
                      <CheckCircle2 className="size-3.5" />
                      {receiptPayload.request.receipt_confirmed_by_name || receiptPayload.request.receipt_confirmed_by || '수령자'} /{' '}
                      {receiptPayload.request.receipt_confirmed_at.replace('T', ' ').slice(0, 19)}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-600">기타내용(출력 포함)</label>
                <textarea
                  value={receiptExtraNote}
                  onChange={(e) => setReceiptExtraNote(e.target.value)}
                  placeholder="인수확인증에 출력할 추가 메모를 입력하세요."
                  className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-slate-500"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="mt-2 border-t border-slate-200 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={printReceiptCertificate}
              disabled={!receiptPayload}
              title="인수확인증 출력"
            >
              <Printer className="mr-1 size-4" />
              출력
            </Button>
            <Button type="button" variant="outline" onClick={() => setReceiptDialogOpen(false)}>
              닫기
            </Button>
            <Button
              type="button"
              onClick={() => void confirmReceipt()}
              disabled={
                receiptSubmitting ||
                receiptLoading ||
                !receiptPayload ||
                !receiptPayload.can_confirm ||
                Boolean(receiptPayload.request.receipt_confirmed_at) ||
                receiptPayload.request.dispatch_state !== 'in_progress'
              }
            >
              수령확인
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </ApprovalPageLayout>
  )
}
