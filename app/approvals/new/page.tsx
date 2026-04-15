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

  const [docType, setDocType] = useState('draft_doc')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [writerId, setWriterId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [approverId, setApproverId] = useState('')

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()

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

      if (user) {
        setWriterId(user.id)
      } else if (fetchedUsers.length > 0) {
        setWriterId(fetchedUsers[0].id)
      }

      setIsLoading(false)
    }

    loadData()
  }, [])

  const deptMap = useMemo(
    () => new Map(departments.map((dept) => [dept.id, dept.dept_name])),
    [departments]
  )

  const selectedWriter = users.find((u) => u.id === writerId)
  
  // 🌟 결재자 목록에서 '나(기안자)'를 제외한 목록 생성
  const selectableUsers = users.filter((u) => u.id !== writerId)

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
      setErrorMessage('작성자를 불러올 수 없습니다. 다시 로그인해 주세요.')
      return
    }

    // 🌟 1차 결재자(검토자) 필수 체크 삭제! (선택사항으로 변경)

    if (!approverId) {
      setErrorMessage('최종 결재자를 선택하십시오.')
      return
    }

    if (reviewerId && reviewerId === approverId) {
      setErrorMessage('검토자와 최종 결재자는 서로 달라야 합니다.')
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

    // 🌟 2. 결재선 유동적 생성 (검토자가 없으면 최종 결재자가 1순위)
    const linesToInsert = []

    if (reviewerId) {
      // 검토자가 있을 때
      linesToInsert.push({
        approval_doc_id: docId,
        line_no: 1,
        approver_id: reviewerId,
        approver_role: 'review',
        status: 'pending', // 지금 결재할 차례
        opinion: null,
      })
    }

    linesToInsert.push({
      approval_doc_id: docId,
      line_no: reviewerId ? 2 : 1, // 검토자가 있으면 2번, 없으면 1번 라인
      approver_id: approverId,
      approver_role: 'approve',
      status: reviewerId ? 'waiting' : 'pending', // 검토자가 있으면 대기, 없으면 바로 결재 차례
      opinion: null,
    })

    const { error: linesError } = await supabase.from('approval_lines').insert(linesToInsert)

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
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-screen">
        <p className="text-gray-500 font-bold">기안서 등록 화면을 준비하는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      <form onSubmit={handleSubmit}>
        <div className="flex justify-between items-end mb-8 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">기안서 등록</h1>
            <p className="text-sm font-bold text-gray-500 mt-2">
              {selectedWriter ? `${deptMap.get(selectedWriter.dept_id ?? -1) ?? '-'} | ${selectedWriter.user_name}` : '로딩중...'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link 
              href="/approvals"
              className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
            >
              취소
            </Link>
            <button 
              type="button"
              className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              임시 저장
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '작성 후 상신'}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 font-bold border border-red-200 shadow-sm">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800 mb-5">문서 정보</h2>
              
              <div className="space-y-4">
                <div>
                  <select 
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full md:w-1/3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                  >
                    <option value="draft_doc">일반기안</option>
                    <option value="purchase_request">구매품의</option>
                    <option value="leave_request">휴가신청</option>
                  </select>
                </div>

                <div>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="기안 제목을 입력하세요 (예: 교육용 시약 구매 품의)" 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    required
                  />
                </div>

                <div>
                  <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="기안 내용을 상세히 입력하십시오." 
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm h-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-none"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-80 shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm sticky top-6">
              <h2 className="text-lg font-black text-gray-800 mb-5">결재 라인</h2>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-12 text-center bg-gray-100 text-gray-600 font-bold text-[11px] py-1.5 rounded uppercase tracking-wider">
                    기안
                  </span>
                  <div className="flex-1 border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedWriter ? selectedWriter.user_name : '로딩중...'}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-12 text-center bg-blue-50 text-blue-600 font-bold text-[11px] py-1.5 rounded uppercase tracking-wider">
                    검토
                  </span>
                  <select 
                    value={reviewerId}
                    onChange={(e) => setReviewerId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none truncate"
                  >
                    <option value="">검토 생략 (선택 안 함)</option>
                    {/* 🌟 나 자신을 제외한 목록 표출 */}
                    {selectableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.user_name} / {deptMap.get(user.dept_id ?? -1) ?? '-'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button type="button" className="w-full border border-dashed border-gray-300 text-gray-400 text-xs font-bold py-2 rounded hover:bg-gray-50 hover:text-gray-600 transition-colors">
                  + 검토 추가
                </button>

                <div className="flex items-center gap-3">
                  <span className="w-12 text-center bg-blue-600 text-white font-bold text-[11px] py-1.5 rounded uppercase tracking-wider">
                    결재
                  </span>
                  <select 
                    value={approverId}
                    onChange={(e) => setApproverId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none truncate"
                  >
                    <option value="">최종 결재자 선택...</option>
                    {/* 🌟 나 자신을 제외한 목록 표출 */}
                    {selectableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.user_name} / {deptMap.get(user.dept_id ?? -1) ?? '-'}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="button" className="w-full border border-dashed border-gray-300 text-gray-400 text-xs font-bold py-2 rounded hover:bg-gray-50 hover:text-gray-600 transition-colors">
                  + 결재 추가
                </button>

              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}