'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ApprovalDoc = {
  id: number
  doc_no: string
  doc_type: string
  title: string
  content: string | null
  status: string
  current_line_no: number | null
  writer_id: string
  dept_id: number
}

type AppUser = {
  id: string
  login_id: string
  user_name: string
  dept_id: number | null
  role_name: string
}

type Department = {
  id: number
  dept_name: string
}

type ApprovalLine = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getApprovalEditErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    return '중복된 값이 있습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '수정 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }

  return '기안서 수정 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

export default function EditApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [docId, setDocId] = useState<number | null>(null)
  const [docNo, setDocNo] = useState('')
  const [docType, setDocType] = useState('purchase_request')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [writerId, setWriterId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [approverId, setApproverId] = useState('')
  const [docStatus, setDocStatus] = useState('draft')

  const [users, setUsers] = useState<AppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [line1Id, setLine1Id] = useState<number | null>(null)
  const [line2Id, setLine2Id] = useState<number | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 기안서 경로입니다.')
        setIsLoading(false)
        return
      }

      const [
        { data: doc, error: docError },
        { data: lines, error: linesError },
        { data: usersData, error: usersError },
        { data: deptData, error: deptError },
      ] = await Promise.all([
        supabase.from('approval_docs').select('*').eq('id', id).single(),
        supabase
          .from('approval_lines')
          .select('*')
          .eq('approval_doc_id', id)
          .order('line_no'),
        supabase
          .from('app_users')
          .select('id, login_id, user_name, dept_id, role_name')
          .order('user_name'),
        supabase.from('departments').select('id, dept_name').order('id'),
      ])

      if (docError || !doc) {
        setErrorMessage('기안서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (linesError || !lines) {
        setErrorMessage('결재선 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (usersError) {
        setErrorMessage('사용자 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (deptError) {
        setErrorMessage('부서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const typedDoc = doc as ApprovalDoc
      const typedLines = lines as ApprovalLine[]

      setDocId(typedDoc.id)
      setDocNo(typedDoc.doc_no)
      setDocType(typedDoc.doc_type)
      setTitle(typedDoc.title)
      setContent(typedDoc.content ?? '')
      setWriterId(typedDoc.writer_id)
      setDocStatus(typedDoc.status)

      const firstLine = typedLines.find((line) => line.line_no === 1)
      const secondLine = typedLines.find((line) => line.line_no === 2)

      if (firstLine) {
        setLine1Id(firstLine.id)
        setReviewerId(firstLine.approver_id)
      }

      if (secondLine) {
        setLine2Id(secondLine.id)
        setApproverId(secondLine.approver_id)
      }

      setUsers((usersData as AppUser[]) ?? [])
      setDepartments((deptData as Department[]) ?? [])
      setIsLoading(false)
    }

    loadData()
  }, [params])

  const deptMap = useMemo(
    () => new Map(departments.map((dept) => [dept.id, dept.dept_name])),
    [departments]
  )

  const selectedWriter = users.find((u) => u.id === writerId)

  // draft / rejected 만 수정 가능
  const canEdit = ['draft', 'rejected'].includes(docStatus)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setErrorMessage('')
    setSuccessMessage('')

    if (!docId) {
      setErrorMessage('기안서 정보가 올바르지 않습니다.')
      return
    }

    if (!canEdit) {
      setErrorMessage('임시저장 또는 반려 상태 문서만 수정할 수 있습니다.')
      return
    }

    if (!title.trim()) {
      setErrorMessage('제목을 입력하십시오.')
      return
    }

    if (!content.trim()) {
      setErrorMessage('내용을 입력하십시오.')
      return
    }

    if (!writerId) {
      setErrorMessage('작성자를 선택하십시오.')
      return
    }

    if (!reviewerId) {
      setErrorMessage('1차 결재자를 선택하십시오.')
      return
    }

    if (!approverId) {
      setErrorMessage('최종 결재자를 선택하십시오.')
      return
    }

    if (reviewerId === approverId) {
      setErrorMessage('1차 결재자와 최종 결재자는 서로 달라야 합니다.')
      return
    }

    if (!selectedWriter?.dept_id) {
      setErrorMessage('선택한 작성자에 부서 정보가 없습니다.')
      return
    }

    if (!line1Id || !line2Id) {
      setErrorMessage('결재선 정보가 올바르지 않습니다.')
      return
    }

    setIsSaving(true)

    const { error: docError } = await supabase
      .from('approval_docs')
      .update({
        doc_type: docType,
        title: title.trim(),
        content: content.trim(),
        writer_id: writerId,
        dept_id: selectedWriter.dept_id,
        remarks: '웹 수정 문서',
      })
      .eq('id', docId)

    if (docError) {
      setIsSaving(false)
      setErrorMessage(getApprovalEditErrorMessage(docError))
      return
    }

    const { error: line1Error } = await supabase
      .from('approval_lines')
      .update({
        approver_id: reviewerId,
      })
      .eq('id', line1Id)

    if (line1Error) {
      setIsSaving(false)
      setErrorMessage(getApprovalEditErrorMessage(line1Error))
      return
    }

    const { error: line2Error } = await supabase
      .from('approval_lines')
      .update({
        approver_id: approverId,
      })
      .eq('id', line2Id)

    if (line2Error) {
      setIsSaving(false)
      setErrorMessage(getApprovalEditErrorMessage(line2Error))
      return
    }

    setIsSaving(false)
    setSuccessMessage('기안서 정보가 저장되었습니다.')
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow">
        <p className="text-gray-500">기안서 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/approvals/${docId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 기안서 상세로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">기안서 수정</h1>
          <p className="mt-1 text-gray-600">
            기안 문서와 결재선을 수정합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          문서번호: <span className="font-medium">{docNo}</span> / 상태:{' '}
          <span className="font-medium">{docStatus}</span>
          {!canEdit && (
            <span className="ml-2 text-red-600">
              (임시저장 또는 반려 상태 문서만 수정할 수 있습니다)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              문서유형
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
            >
              <option value="purchase_request">구매품의</option>
              <option value="draft_doc">일반기안</option>
              <option value="leave_request">휴가신청</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              작성자
            </label>
            <select
              value={writerId}
              onChange={(e) => setWriterId(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
            >
              <option value="">작성자 선택</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.user_name} / {deptMap.get(user.dept_id ?? -1) ?? '-'} / {user.role_name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              제목
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              내용
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              1차 결재자
            </label>
            <select
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
            >
              <option value="">1차 결재자 선택</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.user_name} / {deptMap.get(user.dept_id ?? -1) ?? '-'} / {user.role_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              최종 결재자
            </label>
            <select
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black disabled:bg-gray-100"
            >
              <option value="">최종 결재자 선택</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.user_name} / {deptMap.get(user.dept_id ?? -1) ?? '-'} / {user.role_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSaving || !canEdit}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link
            href={`/approvals/${docId}`}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            상세로
          </Link>
        </div>
      </form>
    </div>
  )
}