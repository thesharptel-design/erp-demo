'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type DispatchState = 'queue' | 'assigned' | 'in_progress' | 'completed' | null
type RequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'cancelled'

type HandlerOption = {
  id: string
  name: string
}

type PlannedOutboundItem = {
  no: number
  itemCode: string
  itemName: string
  lot: string | null
  sn: string | null
  exp: string | null
  qty: number
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const message = (payload as { error?: unknown }).error
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

export default function OutboundDispatchActionButtons({
  outboundRequestId,
  requestStatus,
  dispatchState,
  handlerUserId,
  handlerName,
  currentUserId,
  currentUserName,
  canAssignHandler,
  canReassignRecall,
  canExecuteSelf,
  canExecuteAny,
  canRecallByTeacherPolicy,
  handlerOptions,
  plannedItems = [],
  compact = false,
}: {
  outboundRequestId: number
  requestStatus: RequestStatus
  dispatchState: DispatchState
  handlerUserId: string | null
  handlerName: string | null
  currentUserId: string | null
  currentUserName?: string | null
  canAssignHandler: boolean
  canReassignRecall: boolean
  canExecuteSelf: boolean
  canExecuteAny: boolean
  canRecallByTeacherPolicy: boolean
  handlerOptions: HandlerOption[]
  plannedItems?: PlannedOutboundItem[]
  compact?: boolean
}) {
  const { isSubmitting, run } = useSingleSubmit()
  const [selectedHandlerId, setSelectedHandlerId] = useState<string>(handlerUserId ?? '')
  const [note, setNote] = useState<string>('')

  const isApprovedFlow = requestStatus === 'approved'
  const isDone = requestStatus === 'completed' || dispatchState === 'completed'
  const isAssignedToMe = Boolean(currentUserId && handlerUserId && currentUserId === handlerUserId)

  const canAssign = isApprovedFlow && !isDone && !handlerUserId && (canAssignHandler || canExecuteAny)
  const canReassign = isApprovedFlow && !isDone && !!handlerUserId && (canReassignRecall || canExecuteAny)
  const canRecall = isApprovedFlow && !isDone && !!handlerUserId && (canReassignRecall || canRecallByTeacherPolicy || canExecuteAny)
  const canStartSelf = isApprovedFlow && !isDone && (canExecuteSelf || canExecuteAny)
  const canComplete = isApprovedFlow && !isDone && (isAssignedToMe || canExecuteAny)
  const canShowControls = canAssign || canReassign || canRecall || canStartSelf || canComplete

  const sortedHandlers = useMemo(
    () => [...handlerOptions].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [handlerOptions]
  )

  const runAction = (action: 'assign' | 'reassign' | 'recall' | 'execute_self' | 'complete') =>
    run(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        alert('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
        return
      }

      const body: Record<string, unknown> = {
        outbound_request_id: outboundRequestId,
        action,
      }
      if (note.trim().length > 0) body.note = note.trim()

      if (action === 'assign' || action === 'reassign') {
        if (!selectedHandlerId) {
          alert('담당자를 먼저 선택해 주세요.')
          return
        }
        body.handler_user_id = selectedHandlerId
      }

      const response = await fetch('/api/outbound-requests/dispatch-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(getErrorMessage(payload, '출고 통제 처리에 실패했습니다.'))
        return
      }

      alert('처리가 완료되었습니다.')
      window.location.reload()
    })

  if (!isApprovedFlow || !canShowControls) return null

  const uiStateLabel = dispatchState === 'in_progress' ? '진행중' : '출고대기'
  const uiHandlerName =
    handlerName ??
    ((dispatchState == null || dispatchState === 'queue') && canStartSelf && currentUserName
      ? `${currentUserName}(예정)`
      : '미지정')

  return (
    <div className={`w-full rounded-2xl border border-slate-200 bg-slate-50 ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`font-black text-slate-700 ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
        출고 통제
        <span className={`${compact ? 'ml-1.5' : 'ml-2'} text-slate-500`}>
          상태: {uiStateLabel} / 담당자: {uiHandlerName}
        </span>
      </p>

      {(canAssign || canReassign) && (
        <div className={`mt-3 flex flex-col gap-2 ${compact ? '' : 'sm:flex-row sm:items-center'}`}>
          <select
            value={selectedHandlerId}
            onChange={(e) => setSelectedHandlerId(e.target.value)}
            disabled={isSubmitting}
            className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 outline-none focus:border-blue-500 ${compact ? 'text-xs' : 'text-sm sm:max-w-sm'}`}
          >
            <option value="">담당자 선택</option>
            {sortedHandlers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {canAssign ? (
            <button
              type="button"
              onClick={() => void runAction('assign')}
              disabled={isSubmitting}
              className={`rounded-xl border-2 border-cyan-600 bg-cyan-50 px-4 py-2 font-black text-cyan-900 hover:bg-cyan-100 ${compact ? 'text-xs' : 'text-sm'}`}
            >
              담당자 지정
            </button>
          ) : null}
          {canReassign ? (
            <button
              type="button"
              onClick={() => void runAction('reassign')}
              disabled={isSubmitting}
              className={`rounded-xl border-2 border-blue-600 bg-blue-50 px-4 py-2 font-black text-blue-900 hover:bg-blue-100 ${compact ? 'text-xs' : 'text-sm'}`}
            >
              담당자 변경
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-3">
        <p className={`mb-2 font-black text-slate-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>출고예정</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className={`w-full min-w-[720px] text-left ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
            <thead className="border-b border-slate-200 bg-slate-100">
              <tr>
                <th className="px-2 py-2 font-black text-slate-700">No.</th>
                <th className="px-2 py-2 font-black text-slate-700">품목코드</th>
                <th className="px-2 py-2 font-black text-slate-700">품목명</th>
                <th className="px-2 py-2 font-black text-slate-700">LOT</th>
                <th className="px-2 py-2 font-black text-slate-700">SN</th>
                <th className="px-2 py-2 font-black text-slate-700">EXP</th>
                <th className="px-2 py-2 text-right font-black text-slate-700">수량</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plannedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center font-bold text-slate-400">
                    출고예정 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                plannedItems.map((item) => (
                  <tr key={`${item.no}-${item.itemCode}-${item.itemName}`}>
                    <td className="px-2 py-2 font-bold text-slate-500">{item.no}</td>
                    <td className="px-2 py-2 font-black text-blue-700">{item.itemCode || '—'}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">{item.itemName || '—'}</td>
                    <td className="px-2 py-2 font-bold text-slate-600">{item.lot || '-'}</td>
                    <td className="px-2 py-2 font-bold text-slate-600">{item.sn || '-'}</td>
                    <td className="px-2 py-2 font-bold text-slate-600">{item.exp || '-'}</td>
                    <td className="px-2 py-2 text-right font-black text-slate-900">{item.qty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {canStartSelf ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting}
            placeholder="예) 3조 실습 필요 품목 출고합니다."
            className={`min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 ${compact ? 'text-xs' : 'text-sm'}`}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
        {canRecall ? (
          <button
            type="button"
            onClick={() => void runAction('recall')}
            disabled={isSubmitting}
            className={`rounded-xl border-2 border-amber-600 bg-amber-50 px-4 py-2 font-black text-amber-900 hover:bg-amber-100 ${compact ? 'text-xs' : 'text-sm'}`}
          >
            담당자 회수
          </button>
        ) : null}
        {canStartSelf ? (
          <button
            type="button"
            onClick={() => void runAction('execute_self')}
            disabled={isSubmitting}
            className={`rounded-xl border-2 border-indigo-600 bg-indigo-50 px-4 py-2 font-black text-indigo-900 hover:bg-indigo-100 ${compact ? 'text-xs' : 'text-sm'}`}
          >
            출고 시작
          </button>
        ) : null}
        {canComplete ? (
          <button
            type="button"
            onClick={() => void runAction('complete')}
            disabled={isSubmitting}
            className={`rounded-xl border-2 border-purple-700 bg-purple-600 px-4 py-2 font-black text-white hover:bg-purple-700 ${compact ? 'text-xs' : 'text-sm'}`}
          >
            출고 완료
          </button>
        ) : null}
        </div>
      </div>
    </div>
  )
}
