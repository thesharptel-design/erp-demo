'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions } from '@/lib/permissions'

type ApprovalLine = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
  acted_at: string | null
  opinion: string | null
  created_at?: string
  updated_at?: string
}

type Props = {
  docId: number
  docNo: string
  lines: ApprovalLine[]
}

type CurrentUser = {
  id: string
  login_id: string
  user_name: string
  role_name: string
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getApprovalErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    return '중복 처리 오류가 발생했습니다. 새로고침 후 다시 시도하십시오.'
  }

  if (error.code === '23502') {
    return '필수 처리값이 누락되었습니다.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '현재 사용자에게는 결재 처리 권한이 없습니다.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }

  return error.message || '결재 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

export default function ApprovalActionButtons({
  docId,
  docNo,
  lines,
}: Props) {
  const router = useRouter()

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [canApprove, setCanApprove] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    async function loadPermissions() {
      const permissions = await getCurrentUserPermissions()
      setCurrentUser(permissions)
      setCanApprove(permissions?.can_approve ?? false)
    }

    loadPermissions()
  }, [])

  const currentLine =
    lines.find((line) => line.status === 'pending') ??
    lines.find((line) => line.status === 'waiting') ??
    null

  const isDocFinished =
    lines.length > 0 &&
    ['approved', 'rejected'].includes(
      lines[lines.length - 1]?.status ?? ''
    )

  async function insertApprovalHistory(
    approvalLineId: number | null,
    actionType: string,
    actionComment: string | null
  ) {
    if (!currentUser?.id) {
      throw new Error('현재 사용자 정보가 없습니다.')
    }

    const { error } = await supabase.from('approval_histories').insert({
      approval_doc_id: docId,
      approval_line_id: approvalLineId,
      actor_id: currentUser.id,
      action_type: actionType,
      action_comment: actionComment,
      action_at: new Date().toISOString(),
    })

    if (error) {
      throw error
    }
  }

  async function handleApprove() {
    if (!canApprove) {
      setErrorMessage('현재 사용자에게는 승인 권한이 없습니다.')
      return
    }

    if (!currentUser?.id) {
      setErrorMessage('현재 사용자 정보가 없습니다.')
      return
    }

    if (!currentLine) {
      setErrorMessage('처리할 결재선이 없습니다.')
      return
    }

    if (isDocFinished) {
      setErrorMessage('이미 종결된 문서입니다.')
      return
    }

    setIsProcessing(true)
    setErrorMessage('')
    setSuccessMessage('')

    const now = new Date().toISOString()

    const { error: lineUpdateError } = await supabase
      .from('approval_lines')
      .update({
        status: 'approved',
        acted_at: now,
        opinion: '승인',
        updated_at: now,
      })
      .eq('id', currentLine.id)

    if (lineUpdateError) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(lineUpdateError))
      return
    }

    const nextLine = lines.find((line) => line.line_no === currentLine.line_no + 1)

    if (nextLine) {
      const { error: nextLineError } = await supabase
        .from('approval_lines')
        .update({
          status: 'pending',
          updated_at: now,
        })
        .eq('id', nextLine.id)

      if (nextLineError) {
        setIsProcessing(false)
        setErrorMessage(getApprovalErrorMessage(nextLineError))
        return
      }

      const { error: docUpdateError } = await supabase
        .from('approval_docs')
        .update({
          status: 'in_review',
          current_line_no: nextLine.line_no,
          updated_at: now,
        })
        .eq('id', docId)

      if (docUpdateError) {
        setIsProcessing(false)
        setErrorMessage(getApprovalErrorMessage(docUpdateError))
        return
      }

      try {
        await insertApprovalHistory(
          currentLine.id,
          'approve',
          `${currentLine.line_no}차 결재 승인`
        )
      } catch (error) {
        setIsProcessing(false)
        setErrorMessage(getApprovalErrorMessage(error as SupabaseErrorLike))
        return
      }

      setIsProcessing(false)
      setSuccessMessage(`문서 ${docNo}의 ${currentLine.line_no}차 결재가 승인되었습니다.`)
      router.refresh()
      return
    }

    const { error: docCompleteError } = await supabase
      .from('approval_docs')
      .update({
        status: 'approved',
        current_line_no: currentLine.line_no,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', docId)

    if (docCompleteError) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(docCompleteError))
      return
    }

    try {
      await insertApprovalHistory(
        currentLine.id,
        'approve',
        '최종 결재 승인'
      )
    } catch (error) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(error as SupabaseErrorLike))
      return
    }

    setIsProcessing(false)
    setSuccessMessage(`문서 ${docNo}가 최종 승인되었습니다.`)
    router.refresh()
  }

  async function handleReject() {
    if (!canApprove) {
      setErrorMessage('현재 사용자에게는 반려 권한이 없습니다.')
      return
    }

    if (!currentUser?.id) {
      setErrorMessage('현재 사용자 정보가 없습니다.')
      return
    }

    if (!currentLine) {
      setErrorMessage('처리할 결재선이 없습니다.')
      return
    }

    if (isDocFinished) {
      setErrorMessage('이미 종결된 문서입니다.')
      return
    }

    if (!rejectReason.trim()) {
      setErrorMessage('반려 사유를 입력하십시오.')
      return
    }

    setIsProcessing(true)
    setErrorMessage('')
    setSuccessMessage('')

    const now = new Date().toISOString()

    const { error: lineUpdateError } = await supabase
      .from('approval_lines')
      .update({
        status: 'rejected',
        acted_at: now,
        opinion: rejectReason.trim(),
        updated_at: now,
      })
      .eq('id', currentLine.id)

    if (lineUpdateError) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(lineUpdateError))
      return
    }

    const waitingLineIds = lines
      .filter((line) => line.line_no > currentLine.line_no && line.status === 'waiting')
      .map((line) => line.id)

    if (waitingLineIds.length > 0) {
      const { error: waitingResetError } = await supabase
        .from('approval_lines')
        .update({
          status: 'waiting',
          updated_at: now,
        })
        .in('id', waitingLineIds)

      if (waitingResetError) {
        setIsProcessing(false)
        setErrorMessage(getApprovalErrorMessage(waitingResetError))
        return
      }
    }

    const { error: docRejectError } = await supabase
      .from('approval_docs')
      .update({
        status: 'rejected',
        completed_at: now,
        updated_at: now,
      })
      .eq('id', docId)

    if (docRejectError) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(docRejectError))
      return
    }

    try {
      await insertApprovalHistory(
        currentLine.id,
        'reject',
        rejectReason.trim()
      )
    } catch (error) {
      setIsProcessing(false)
      setErrorMessage(getApprovalErrorMessage(error as SupabaseErrorLike))
      return
    }

    setIsProcessing(false)
    setSuccessMessage(`문서 ${docNo}가 반려되었습니다.`)
    setRejectReason('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">결재 처리</h2>
          <p className="mt-1 text-sm text-gray-500">
            현재 문서의 승인 / 반려를 처리합니다.
          </p>
        </div>

        {!canApprove && (
          <div className="mb-4 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            현재 사용자에게는 승인 / 반려 권한이 없습니다.
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            반려 사유
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            disabled={isProcessing || !currentLine || !canApprove || isDocFinished}
            rows={4}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
            placeholder="반려 시 사유를 입력하십시오."
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isProcessing || !currentLine || !canApprove || isDocFinished}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isProcessing ? '처리 중...' : '승인'}
          </button>

          <button
            type="button"
            onClick={handleReject}
            disabled={isProcessing || !currentLine || !canApprove || isDocFinished}
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            반려
          </button>
        </div>
      </div>
    </div>
  )
}