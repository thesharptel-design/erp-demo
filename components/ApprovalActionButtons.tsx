'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ApprovalDocLike, ApprovalLineLike } from '@/lib/approval-status'
import {
  getApprovalRoleLabel,
  isFinalApprovalRole,
  isPostCooperatorRole,
  isPreCooperatorRole,
  normalizeApprovalRole,
} from '@/lib/approval-roles'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type ApprovalParticipantLike = {
  user_id: string
  role: string
  line_no: number
}

type FlowLine = {
  id?: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
  acted_at?: string | null
  opinion?: string | null
}

type ApiAction =
  | 'recall_before_first_action'
  | 'request_cancel_after_action'
  | 'confirm_pre_cooperation'
  | 'approve_document'
  | 'override_approve_document'
  | 'reject_document'
  | 'confirm_post_cooperation'

const ACTIVE_DOC_STATUSES = new Set(['submitted', 'in_review', 'in_progress'])
const EFFECTIVE_DOC_STATUSES = new Set(['approved', 'effective'])
const PROCESSED_LINE_STATUSES = new Set(['confirmed', 'approved', 'rejected', 'skipped', 'cancelled'])

const TOOLTIP = {
  recall:
    '아직 아무도 협조확인이나 결재를 하지 않은 문서를 임시저장 상태로 되돌립니다.',
  cancelRequest:
    '이미 협조/결재가 진행된 문서라 직접 회수할 수 없습니다. 현재 결재자에게 취소 검토를 요청합니다.',
  preConfirm:
    '문서 내용을 확인하고 다음 단계로 넘깁니다. 사전협조자는 반려할 수 없습니다.',
  approve:
    '내 결재 단계를 승인하고 다음 결재자에게 넘깁니다. 마지막 결재자라면 문서 효력이 발생합니다.',
  overrideApprove:
    '최종 결재자가 남은 미처리 단계를 전결생략으로 기록하고 문서를 즉시 최종 승인합니다.',
  rejectDirect:
    '중간 단계를 거치지 않고 기안자에게 바로 반려합니다.',
  rejectSequential:
    '바로 이전 처리자에게 문서를 되돌립니다.',
  rejectTargeted:
    '이미 처리한 이전 단계 중 특정 대상에게 문서를 되돌립니다.',
  postConfirm:
    '이미 효력이 발생한 문서를 사후 확인합니다. 모든 사후협조자가 확인하면 최종종결됩니다.',
  reference:
    '참조자는 문서를 열람만 할 수 있으며 별도의 처리 버튼은 없습니다.',
}

function formatClientError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'error' in e) {
    const msg = (e as { error?: unknown }).error
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return '처리 중 오류가 발생했습니다.'
}

function sameUser(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}

function isActiveStatus(status: string) {
  return ACTIVE_DOC_STATUSES.has(String(status ?? ''))
}

function isEffectiveStatus(status: string) {
  return EFFECTIVE_DOC_STATUSES.has(String(status ?? ''))
}

function getActionFlow(lines: FlowLine[]) {
  return [...lines]
    .filter((line) => {
      const role = normalizeApprovalRole(line.approver_role)
      return role === 'pre_cooperator' || role === 'approver' || role === 'post_cooperator'
    })
    .sort((a, b) => a.line_no - b.line_no)
}

function getRoleButtonClass(kind: 'primary' | 'success' | 'danger' | 'warning' | 'neutral') {
  const base =
    'min-h-11 rounded-2xl px-4 py-3 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  if (kind === 'primary') return `${base} bg-blue-600 text-white hover:bg-blue-700`
  if (kind === 'success') return `${base} bg-emerald-600 text-white hover:bg-emerald-700`
  if (kind === 'danger') return `${base} bg-red-100 text-red-700 hover:bg-red-200`
  if (kind === 'warning') return `${base} bg-amber-100 text-amber-900 hover:bg-amber-200`
  return `${base} border border-gray-200 bg-white text-gray-800 hover:bg-gray-50`
}

export default function ApprovalActionButtons({
  doc,
  lines,
  participants = [],
  actionGuard,
}: {
  doc: ApprovalDocLike & { id: number; writer_id?: string | null; doc_type?: string | null; status: string }
  lines: ApprovalLineLike[]
  participants?: ApprovalParticipantLike[]
  actionGuard?: {
    allow: boolean
    message?: string
  }
}) {
  const router = useRouter()
  const { isSubmitting: processing, run: runSingleSubmit } = useSingleSubmit()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [opinion, setOpinion] = useState('')
  const [targetLineNo, setTargetLineNo] = useState<number | ''>('')
  const actionsAllowed = actionGuard?.allow ?? true
  const actionDeniedMessage = actionGuard?.message ?? '현재 사용자에게 이 액션 권한이 없습니다.'

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return
      const authUser = data.user
      if (!authUser) {
        setCurrentUserId(null)
        return
      }
      const email = String(authUser.email ?? '').trim()
      const byId = await supabase.from('app_users').select('id').eq('id', authUser.id).maybeSingle()
      if (!active) return
      if (!byId.error && byId.data?.id) {
        setCurrentUserId(String(byId.data.id))
        return
      }
      if (email) {
        const byEmail = await supabase.from('app_users').select('id').eq('email', email).maybeSingle()
        if (!active) return
        setCurrentUserId(String(byEmail.data?.id ?? authUser.id))
        return
      }
      setCurrentUserId(authUser.id)
    })
    return () => {
      active = false
    }
  }, [])

  const orderedFlow = useMemo<FlowLine[]>(() => {
    const sortedLines = [...(lines || [])].sort((a, b) => a.line_no - b.line_no)
    return sortedLines.map((line) => ({
      id: line.id,
      line_no: line.line_no,
      approver_id: line.approver_id,
      approver_role: line.approver_role,
      status: line.status,
      opinion: line.opinion ?? null,
    }))
  }, [lines])

  if (!currentUserId) return null

  const isWriter = sameUser(doc.writer_id, currentUserId)
  const actionFlow = getActionFlow(orderedFlow)
  const pendingLine = actionFlow.find((line) => line.status === 'pending') ?? null
  const myPendingLine = pendingLine && sameUser(pendingLine.approver_id, currentUserId) ? pendingLine : null
  const hasProcessedLine = actionFlow.some((line) => PROCESSED_LINE_STATUSES.has(line.status))
  const lastApproverLine = actionFlow.filter((line) => isFinalApprovalRole(line.approver_role)).at(-1) ?? null
  const isLastApprover = Boolean(lastApproverLine && sameUser(lastApproverLine.approver_id, currentUserId))
  const activeDoc = isActiveStatus(doc.status)
  const effectiveDoc = isEffectiveStatus(doc.status)
  const canRecall = isWriter && activeDoc && !hasProcessedLine
  const canRequestCancel = isWriter && activeDoc && hasProcessedLine
  const canPreConfirm = Boolean(myPendingLine && isPreCooperatorRole(myPendingLine.approver_role) && activeDoc)
  const canApprove = Boolean(myPendingLine && isFinalApprovalRole(myPendingLine.approver_role) && activeDoc)
  const canOverrideApprove = activeDoc && isLastApprover
  const canReject = activeDoc && (canApprove || isLastApprover)
  const canPostConfirm = effectiveDoc && actionFlow.some(
    (line) =>
      sameUser(line.approver_id, currentUserId) &&
      isPostCooperatorRole(line.approver_role) &&
      (line.status === 'pending' || line.status === 'waiting')
  )
  const isReferenceOnly = participants.some(
    (participant) =>
      sameUser(participant.user_id, currentUserId) && normalizeApprovalRole(participant.role) === 'reference'
  )

  const rejectTargets = actionFlow.filter((line) => {
    const actorLine = myPendingLine ?? lastApproverLine
    if (!actorLine) return false
    if (line.line_no >= actorLine.line_no) return false
    return line.status === 'confirmed' || line.status === 'approved'
  })

  async function runAction(action: ApiAction, extra?: Record<string, unknown>) {
    if (!actionsAllowed) {
      alert(actionDeniedMessage)
      return
    }
    await runSingleSubmit(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('로그인이 필요합니다.')
        const response = await fetch('/api/approvals/actions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            docId: doc.id,
            action,
            opinion,
            ...extra,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string }
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || '처리 중 오류가 발생했습니다.')
        }
        router.refresh()
        window.location.reload()
      } catch (e) {
        alert(formatClientError(e))
      }
    })
  }

  function requireOpinion(label: string) {
    if (opinion.trim().length >= 2) return true
    alert(`${label} 사유 또는 의견을 2글자 이상 입력하세요.`)
    return false
  }

  return (
    <div className="space-y-4 rounded-3xl border-2 border-gray-100 bg-white p-6 shadow-sm">
      <textarea
        className="w-full rounded-2xl border-0 bg-gray-50 p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="의견 또는 반려/취소요청 사유를 입력하세요."
        value={opinion}
        onChange={(event) => setOpinion(event.target.value)}
        rows={3}
      />

      {isWriter && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {canRecall && (
            <button
              type="button"
              title={TOOLTIP.recall}
              aria-label={TOOLTIP.recall}
              disabled={processing}
              onClick={() => {
                if (confirm('아직 아무도 처리하지 않은 문서를 임시저장으로 회수할까요?')) {
                  void runAction('recall_before_first_action')
                }
              }}
              className={getRoleButtonClass('warning')}
            >
              기안회수
            </button>
          )}
          {canRequestCancel && (
            <button
              type="button"
              title={TOOLTIP.cancelRequest}
              aria-label={TOOLTIP.cancelRequest}
              disabled={processing}
              onClick={() => {
                if (!requireOpinion('취소요청')) return
                void runAction('request_cancel_after_action')
              }}
              className={getRoleButtonClass('danger')}
            >
              취소요청
            </button>
          )}
        </div>
      )}

      {canPreConfirm && (
        <button
          type="button"
          title={TOOLTIP.preConfirm}
          aria-label={TOOLTIP.preConfirm}
          disabled={processing}
          onClick={() => void runAction('confirm_pre_cooperation')}
          className={`${getRoleButtonClass('success')} w-full`}
        >
          협조확인
        </button>
      )}

      {canApprove && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            title={TOOLTIP.approve}
            aria-label={TOOLTIP.approve}
            disabled={processing}
            onClick={() => void runAction('approve_document')}
            className={getRoleButtonClass('primary')}
          >
            승인
          </button>
          {canOverrideApprove && (
            <button
              type="button"
              title={TOOLTIP.overrideApprove}
              aria-label={TOOLTIP.overrideApprove}
              disabled={processing}
              onClick={() => {
                if (confirm('남은 미처리 단계를 전결생략으로 기록하고 최종승인할까요?')) {
                  void runAction('override_approve_document')
                }
              }}
              className={getRoleButtonClass('warning')}
            >
              전결승인
            </button>
          )}
        </div>
      )}

      {canOverrideApprove && !canApprove && (
        <button
          type="button"
          title={TOOLTIP.overrideApprove}
          aria-label={TOOLTIP.overrideApprove}
          disabled={processing}
          onClick={() => {
            if (confirm('최종 결재자 권한으로 남은 단계를 생략하고 최종승인할까요?')) {
              void runAction('override_approve_document')
            }
          }}
          className={`${getRoleButtonClass('warning')} w-full`}
        >
          전결승인
        </button>
      )}

      {canReject && (
        <div className="space-y-2 rounded-2xl border border-red-100 bg-red-50/50 p-3">
          <p className="text-xs font-black text-red-800">반려 처리</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              title={TOOLTIP.rejectDirect}
              aria-label={TOOLTIP.rejectDirect}
              disabled={processing}
              onClick={() => {
                if (!requireOpinion('직권반려')) return
                void runAction('reject_document', { rejectType: 'direct' })
              }}
              className={getRoleButtonClass('danger')}
            >
              직권반려
            </button>
            <button
              type="button"
              title={TOOLTIP.rejectSequential}
              aria-label={TOOLTIP.rejectSequential}
              disabled={processing || rejectTargets.length === 0}
              onClick={() => {
                if (!requireOpinion('순차반려')) return
                void runAction('reject_document', { rejectType: 'sequential' })
              }}
              className={getRoleButtonClass('danger')}
            >
              순차반려
            </button>
            <button
              type="button"
              title={TOOLTIP.rejectTargeted}
              aria-label={TOOLTIP.rejectTargeted}
              disabled={processing || rejectTargets.length === 0 || targetLineNo === ''}
              onClick={() => {
                if (!requireOpinion('선택반려')) return
                void runAction('reject_document', { rejectType: 'targeted', targetLineNo })
              }}
              className={getRoleButtonClass('danger')}
            >
              선택반려
            </button>
          </div>
          {rejectTargets.length > 0 && (
            <select
              value={targetLineNo}
              onChange={(event) => setTargetLineNo(event.target.value ? Number(event.target.value) : '')}
              title="선택반려 시 되돌릴 이전 처리자를 선택합니다."
              className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-900"
            >
              <option value="">선택반려 대상 선택</option>
              {rejectTargets.map((line) => (
                <option key={line.line_no} value={line.line_no}>
                  {line.line_no}차 {getApprovalRoleLabel(line.approver_role)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {canPostConfirm && (
        <button
          type="button"
          title={TOOLTIP.postConfirm}
          aria-label={TOOLTIP.postConfirm}
          disabled={processing}
          onClick={() => void runAction('confirm_post_cooperation')}
          className={`${getRoleButtonClass('success')} w-full`}
        >
          사후확인
        </button>
      )}

      {isReferenceOnly && !canRecall && !canRequestCancel && !canPreConfirm && !canApprove && !canReject && !canPostConfirm && (
        <p title={TOOLTIP.reference} className="rounded-2xl bg-gray-50 p-3 text-center text-xs font-bold text-gray-500">
          참조자는 열람만 가능합니다.
        </p>
      )}
    </div>
  )
}
