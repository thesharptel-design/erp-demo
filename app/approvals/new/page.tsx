'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  APPROVAL_DRAFT_DOC_TYPE_OPTIONS,
} from '@/lib/approval-draft'
import ApprovalDraftPaper from '@/components/approvals/ApprovalDraftPaper'
import { useApprovalDraftForm } from '@/components/approvals/useApprovalDraftForm'

export default function NewApprovalPage() {
  const router = useRouter()
  const {
    isLoading,
    isSaving,
    errorMessage,
    docType,
    setDocType,
    title,
    setTitle,
    content,
    setContent,
    executionStartDate,
    setExecutionStartDate,
    executionEndDate,
    setExecutionEndDate,
    cooperationDept,
    setCooperationDept,
    agreementText,
    setAgreementText,
    approvalOrder,
    setApprovalOrder,
    selectableUsers,
    deptMap,
    selectedWriter,
    writerHasApprovalRight,
    draftedDate,
    submitDraft,
  } = useApprovalDraftForm({ remarks: '웹 등록 문서' })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const ok = await submitDraft()
    if (ok) {
      router.push('/approvals')
      router.refresh()
    }
  }

  if (isLoading) return <div className="p-8 text-center text-gray-500 font-bold">로딩 중...</div>

  return (
    <div className="mx-auto max-w-7xl space-y-4 bg-gray-50 p-8 font-sans min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">기안서 등록</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            {selectedWriter ? `${deptMap.get(selectedWriter.dept_id ?? -1) ?? '-'} | ${selectedWriter.user_name}` : '-'}
          </p>
        </div>
        <Link
          href="/approvals"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          목록으로
        </Link>
      </div>
      <form onSubmit={handleSubmit}>
        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{errorMessage}</div>}
        {!writerHasApprovalRight && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
            작성자에게 결재권이 없어 상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
          </div>
        )}

        <ApprovalDraftPaper
          docType={docType}
          docTypeOptions={APPROVAL_DRAFT_DOC_TYPE_OPTIONS}
          onDocTypeChange={setDocType}
          title={title}
          onTitleChange={setTitle}
          content={content}
          onContentChange={setContent}
          executionStartDate={executionStartDate}
          executionEndDate={executionEndDate}
          cooperationDept={cooperationDept}
          agreementText={agreementText}
          onExecutionStartDateChange={setExecutionStartDate}
          onExecutionEndDateChange={setExecutionEndDate}
          onCooperationDeptChange={setCooperationDept}
          onAgreementTextChange={setAgreementText}
          writerName={selectedWriter?.user_name ?? '-'}
          writerDeptName={deptMap.get(selectedWriter?.dept_id ?? -1) ?? '-'}
          draftedDate={draftedDate}
          approvalOrder={approvalOrder}
          selectableUsers={selectableUsers}
          deptMap={deptMap}
          onApprovalOrderRoleChange={(lineId, role) =>
            setApprovalOrder((prev) =>
              prev.map((line) => (line.id === lineId ? { ...line, role } : line))
            )
          }
          onApprovalOrderAssigneeChange={(lineId, userId) =>
            setApprovalOrder((prev) =>
              prev.map((line) => (line.id === lineId ? { ...line, userId } : line))
            )
          }
          onApprovalOrderAdd={() =>
            setApprovalOrder((prev) => [
              ...prev,
              { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' },
            ])
          }
          onApprovalOrderRemove={(lineId) =>
            setApprovalOrder((prev) => {
              const next = prev.filter((line) => line.id !== lineId)
              if (next.length > 0) return next
              return [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'approver', userId: '' }]
            })
          }
          onApprovalOrderMove={(draggedId, targetId) =>
            setApprovalOrder((prev) => {
              const draggedIndex = prev.findIndex((line) => line.id === draggedId)
              const targetIndex = prev.findIndex((line) => line.id === targetId)
              if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return prev
              const next = [...prev]
              const [dragged] = next.splice(draggedIndex, 1)
              next.splice(targetIndex, 0, dragged)
              return next
            })
          }
        />

        <div className="mt-4 flex justify-end gap-2">
          <Link
            href="/approvals"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={isSaving || !writerHasApprovalRight}
            className="rounded-lg border-2 border-black bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            {isSaving ? '상신 중...' : '작성 후 상신'}
          </button>
          </div>
      </form>
    </div>
  )
}