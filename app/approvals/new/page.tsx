'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getApprovalCreateErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('doc_no')) {
      return '문서번호가 중복되었습니다. 다시 시도해 주세요.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }

  return '기안서 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

function makeDocNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return `AP-${y}${m}${d}-${hh}${mm}${ss}`
}

export default function NewApprovalPage() {
  const router = useRouter()

  const [users, setUsers] = useState<AppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [docType, setDocType] = useState('purchase_request')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [writerId, setWriterId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [approverId, setApproverId] = useState('')

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const [{ data: usersData, error: usersError }, { data: deptData, error: deptError }] =
        await Promise.all([
          supabase
            .from('app_users')
            .select('id, login_id, user_name, dept_id, role_name')
            .order('user_name'),
          supabase.from('departments').select('id, dept_name').order('id'),
        ])

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

      const fetchedUsers = (usersData as AppUser[]) ?? []
      const fetchedDepartments = (deptData as Department[]) ?? []

      setUsers(fetchedUsers)
      setDepartments(fetchedDepartments)

      // 기본값 세팅: 구매 담당 / 결재 담당 / 관리자
      const defaultWriter = fetchedUsers.find((u) => u.login_id === 'purchase')
      const defaultReviewer = fetchedUsers.find((u) => u.login_id === 'approval')
      const defaultApprover = fetchedUsers.find((u) => u.login_id === 'admin')

      if (defaultWriter) setWriterId(defaultWriter.id)
      if (defaultReviewer) setReviewerId(defaultReviewer.id)
      if (defaultApprover) setApproverId(defaultApprover.id)

      setIsLoading(false)
    }

    loadData()
  }, [])

  const deptMap = useMemo(
    () => new Map(departments.map((dept) => [dept.id, dept.dept_name])),
    [departments]
  )

  const selectedWriter = users.find((u) => u.id === writerId)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

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

    setIsSaving(true)

    const docNo = makeDocNo()
    const now = new Date().toISOString()

    // 1. 기안문서 생성
    const { data: docData, error: docError } = await supabase
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: docType,
        title: title.trim(),
        content: content.trim(),
        writer_id: writerId,
        dept_id: selectedWriter.dept_id,
        status: 'submitted',
        current_line_no: 1,
        drafted_at: now,
        submitted_at: now,
        remarks: '웹 등록 문서',
      })
      .select('id')
      .single()

    if (docError || !docData) {
      setIsSaving(false)
      setErrorMessage(getApprovalCreateErrorMessage(docError ?? { message: '문서 생성 실패' }))
      return
    }

    const docId = docData.id as number

    // 2. 결재선 생성
    const { error: linesError } = await supabase.from('approval_lines').insert([
      {
        approval_doc_id: docId,
        line_no: 1,
        approver_id: reviewerId,
        approver_role: 'review',
        status: 'pending',
        opinion: null,
      },
      {
        approval_doc_id: docId,
        line_no: 2,
        approver_id: approverId,
        approver_role: 'approve',
        status: 'waiting',
        opinion: null,
      },
    ])

    if (linesError) {
      setIsSaving(false)
      setErrorMessage(getApprovalCreateErrorMessage(linesError))
      return
    }

    // 3. 상신 이력 생성
    const { error: historyError } = await supabase.from('approval_histories').insert({
      approval_doc_id: docId,
      approval_line_id: null,
      actor_id: writerId,
      action_type: 'submit',
      action_comment: '기안서 상신',
      action_at: now,
    })

    if (historyError) {
      setIsSaving(false)
      setErrorMessage(getApprovalCreateErrorMessage(historyError))
      return
    }

    setIsSaving(false)
    router.push('/approvals')
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow">
        <p className="text-gray-500">기안서 등록 화면을 준비하는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/approvals"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 기안/결재 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">기안서 등록</h1>
          <p className="mt-1 text-gray-600">새로운 기안 문서를 작성하고 상신합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              문서유형
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 교육용 시약 구매 품의"
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="기안 내용을 입력하십시오."
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
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

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '작성 후 상신'}
          </button>

          <Link
            href="/approvals"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}