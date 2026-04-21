'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateNextAppDocNo } from '@/lib/approval-doc-no'
import { APPROVAL_ROLES, getApprovalRoleLabel } from '@/lib/approval-roles'
import { buildApprovalLines, buildApprovalParticipantsRows, normalizeParticipants } from '@/lib/approval-participants'
import SearchableCombobox from '@/components/SearchableCombobox'

type AppUser = {
  id: string
  login_id: string
  user_name: string
  dept_id: number | null
  role_name: string
  can_approval_participate: boolean
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
  if (error.message.includes('결재권')) return '결재권이 없는 사용자는 기안/결재선에 지정할 수 없습니다.'
  if (error.code === '23505') return '문서번호가 중복되었습니다. 다시 시도해 주세요.'
  if (error.code === '23502') return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  return '기안서 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
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
  const [roleAssignees, setRoleAssignees] = useState<Record<string, string[]>>({
    reviewer: [''],
    pre_cooperator: [''],
    final_approver: [''],
    post_cooperator: [''],
    reference: [''],
  })
  const [roleSearches, setRoleSearches] = useState<Record<string, string>>({
    reviewer: '',
    pre_cooperator: '',
    final_approver: '',
    post_cooperator: '',
    reference: '',
  })

  const [errorMessage, setErrorMessage] = useState('')
  const docTypeOptions = [
    { value: 'draft_doc', label: '일반기안' },
    { value: 'purchase_request', label: '구매품의' },
    { value: 'leave_request', label: '휴가신청' },
  ]

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: usersData }, { data: deptData }] = await Promise.all([
        supabase.from('app_users').select('id, login_id, user_name, dept_id, role_name, can_approval_participate').order('user_name'),
        supabase.from('departments').select('id, dept_name').order('id'),
      ])

      setUsers((usersData as AppUser[]) ?? [])
      setDepartments((deptData as Department[]) ?? [])
      if (user) setWriterId(user.id)
      setIsLoading(false)
    }
    loadData()
  }, [])

  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.dept_name])), [departments])
  const selectedWriter = users.find((u) => u.id === writerId)
  const writerHasApprovalRight = selectedWriter?.can_approval_participate === true
  const selectableUsers = users.filter((u) => u.id !== writerId)
  const filteredUsersByRole = useMemo(
    () =>
      APPROVAL_ROLES.reduce<Record<string, AppUser[]>>((acc, role) => {
        const keyword = (roleSearches[role] ?? '').trim().toLowerCase()
        acc[role] = selectableUsers.filter((user) => {
          if (!keyword) return true
          const deptName = deptMap.get(user.dept_id ?? -1) ?? ''
          return (
            user.user_name.toLowerCase().includes(keyword) ||
            user.login_id.toLowerCase().includes(keyword) ||
            user.role_name.toLowerCase().includes(keyword) ||
            String(deptName).toLowerCase().includes(keyword)
          )
        })
        return acc
      }, {}),
    [selectableUsers, roleSearches, deptMap]
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (!title.trim() || !content.trim()) return setErrorMessage('제목과 내용을 모두 입력하십시오.')
    if (!writerId) return setErrorMessage('작성자 정보가 없습니다.')
    if (!writerHasApprovalRight) return setErrorMessage('작성자는 결재권이 있어야 상신할 수 있습니다.')
    if (!roleAssignees.final_approver.some((id) => id.trim())) return setErrorMessage('최종 결재자를 선택하십시오.')

    // 🌟 숫자 0 버그 방지 검증 로직
    if (selectedWriter?.dept_id === null || selectedWriter?.dept_id === undefined) {
      return setErrorMessage('작성자에게 부서(dept_id)가 배정되지 않았습니다.')
    }

    setIsSaving(true)

    try {
      // 🌟 [변경] 상신 직전에 실시간으로 일련번호 생성
      const docNo = await generateNextAppDocNo(supabase)
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

      if (docError || !docData) throw docError || new Error('문서 생성 실패')

      const docId = docData.id

      // 2. 결재선 생성
      const participants = normalizeParticipants(
        APPROVAL_ROLES.flatMap((role) =>
          (roleAssignees[role] ?? []).map((userId) => ({ role, userId }))
        )
      )
      const linesToInsert = buildApprovalLines(docId, participants)
      const participantRows = buildApprovalParticipantsRows(docId, participants)

      if (linesToInsert.length > 0) {
        const { error: linesError } = await supabase.from('approval_lines').insert(linesToInsert)
        if (linesError) throw linesError
      }
      if (participantRows.length > 0) {
        const { error: participantError } = await supabase.from('approval_participants').insert(participantRows)
        if (participantError) throw participantError
      }

      // 3. 상신 이력 생성
      await supabase.from('approval_histories').insert({
        approval_doc_id: docId,
        actor_id: writerId,
        action_type: 'submit',
        action_comment: '기안서 상신',
        action_at: now,
      })

      router.push('/approvals')
      router.refresh()
    } catch (err: any) {
      setErrorMessage(getApprovalCreateErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-gray-500 font-bold">로딩 중...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      <form onSubmit={handleSubmit}>
        <div className="flex justify-between items-end mb-8 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">기안서 등록</h1>
            <p className="text-sm font-bold text-gray-500 mt-2">
              {selectedWriter ? `${deptMap.get(selectedWriter.dept_id ?? -1) ?? '-'} | ${selectedWriter.user_name}` : '-'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/approvals" className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg">취소</Link>
            <button type="submit" disabled={isSaving || !writerHasApprovalRight} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg disabled:opacity-50">
              {isSaving ? '저장 중...' : '작성 후 상신'}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 font-bold border border-red-200">{errorMessage}</div>
        )}
        {!writerHasApprovalRight && (
          <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 font-bold border border-amber-200">
            작성자에게 결재권이 없어 상신할 수 없습니다. 관리자에게 결재권 부여를 요청하세요.
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-black text-gray-800">문서 정보</h2>
            <div className="w-full md:w-1/3">
              <SearchableCombobox
                value={docType}
                onChange={setDocType}
                options={docTypeOptions}
                placeholder="문서 유형 선택"
              />
            </div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="기안 제목을 입력하세요" className="w-full border border-gray-300 rounded-lg px-4 py-2" required />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="기안 내용을 상세히 입력하십시오." className="w-full border border-gray-300 rounded-lg px-4 py-2 h-64 resize-none" required />
          </div>

          <div className="w-full lg:w-80 shrink-0 bg-white border border-gray-200 rounded-xl p-6 shadow-sm sticky top-6 space-y-4">
            <h2 className="text-lg font-black text-gray-800">결재 라인</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3"><span className="w-12 text-center bg-gray-100 text-gray-600 font-bold text-[11px] py-1.5 rounded">기안</span><div className="flex-1 bg-gray-50 p-2 text-sm">{selectedWriter?.user_name}</div></div>
              {APPROVAL_ROLES.map((role) => (
                <div className="space-y-2" key={role}>
                  <input
                    value={roleSearches[role] ?? ''}
                    onChange={(e) =>
                      setRoleSearches((prev) => ({
                        ...prev,
                        [role]: e.target.value,
                      }))
                    }
                    placeholder={`${getApprovalRoleLabel(role)} 검색 (이름/ID/부서)`}
                    className="w-full rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                  />
                  {(roleAssignees[role] ?? ['']).map((assignee, idx) => (
                    <div className="flex items-center gap-3" key={`${role}-${idx}`}>
                      {idx === 0 ? (
                        <span className="w-24 text-center bg-blue-50 text-blue-700 font-bold text-[11px] py-1.5 rounded">
                          {getApprovalRoleLabel(role)}
                        </span>
                      ) : (
                        <span className="w-24 text-center bg-gray-50 text-gray-600 font-bold text-[11px] py-1.5 rounded">
                          {getApprovalRoleLabel(role)} {idx + 1}
                        </span>
                      )}
                      <SearchableCombobox
                        value={assignee}
                        onChange={(nextValue) =>
                          setRoleAssignees((prev) => {
                            const next = [...(prev[role] ?? [''])]
                            next[idx] = nextValue
                            return { ...prev, [role]: next }
                          })
                        }
                        options={(filteredUsersByRole[role] ?? []).map((u) => ({
                          value: u.id,
                          label: `${u.user_name} / ${deptMap.get(u.dept_id ?? -1) ?? '-'}${u.can_approval_participate ? '' : ' [결재권 없음]'}`,
                          keywords: [u.user_name, u.login_id, u.role_name, String(deptMap.get(u.dept_id ?? -1) ?? '')],
                          disabled: !u.can_approval_participate,
                        }))}
                        placeholder={role === 'final_approver' ? '필수 선택' : '선택 안 함'}
                        className="flex-1"
                      />
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRoleAssignees((prev) => {
                              const next = [...(prev[role] ?? [''])]
                              next.splice(idx, 1)
                              return { ...prev, [role]: next.length > 0 ? next : [''] }
                            })
                          }
                          className="px-2 py-1 rounded border border-red-200 text-red-600 text-xs font-black"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="pl-[6.5rem]">
                    <button
                      type="button"
                      onClick={() =>
                        setRoleAssignees((prev) => ({
                          ...prev,
                          [role]: [...(prev[role] ?? ['']), ''],
                        }))
                      }
                      className="px-2 py-1 rounded border border-dashed border-blue-300 text-blue-700 text-xs font-black"
                    >
                      + {getApprovalRoleLabel(role)} 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}