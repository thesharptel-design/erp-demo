'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { APPROVAL_ROLES, getApprovalRoleLabel, normalizeApprovalRole } from '@/lib/approval-roles'
import { buildApprovalLines, buildApprovalParticipantsRows, normalizeParticipants } from '@/lib/approval-participants'
import SearchableCombobox from '@/components/SearchableCombobox'

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
  const [docStatus, setDocStatus] = useState('draft')

  const [users, setUsers] = useState<AppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const docTypeOptions = [
    { value: 'purchase_request', label: '구매품의' },
    { value: 'draft_doc', label: '일반기안' },
    { value: 'leave_request', label: '휴가신청' },
  ]
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
        { data: sessionData },
        { data: participantRows },
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
        supabase.auth.getUser(),
        supabase.from('approval_participants').select('user_id, role, line_no').eq('approval_doc_id', id).order('line_no'),
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
      const currentUserId = sessionData.user?.id
      const currentUser = (usersData as AppUser[] | null)?.find((u) => u.id === currentUserId)
      const isAdmin = String(currentUser?.role_name || '').toLowerCase() === 'admin'
      const isWriter = typedDoc.writer_id === currentUserId
      const isLineApprover = typedLines.some((line) => line.approver_id === currentUserId)
      const isParticipant = (participantRows || []).some((row: any) => row.user_id === currentUserId)
      if (!isAdmin && !isWriter && !isLineApprover && !isParticipant) {
        setErrorMessage('문서 수정 권한이 없습니다.')
        setIsLoading(false)
        return
      }

      setDocId(typedDoc.id)
      setDocNo(typedDoc.doc_no)
      setDocType(typedDoc.doc_type)
      setTitle(typedDoc.title)
      setContent(typedDoc.content ?? '')
      setWriterId(typedDoc.writer_id)
      setDocStatus(typedDoc.status)

      const initialAssignees: Record<string, string[]> = {
        reviewer: [],
        pre_cooperator: [],
        final_approver: [],
        post_cooperator: [],
        reference: [],
      }
      for (const participant of participantRows || []) {
        const role = normalizeApprovalRole((participant as { role: string }).role)
        if (!role) continue
        initialAssignees[role].push((participant as { user_id: string }).user_id)
      }
      if (initialAssignees.final_approver.length === 0) {
        for (const line of typedLines) {
          const role = normalizeApprovalRole(line.approver_role)
          if (!role) continue
          initialAssignees[role].push(line.approver_id)
        }
      }
      for (const role of APPROVAL_ROLES) {
        if ((initialAssignees[role] ?? []).length === 0) initialAssignees[role] = ['']
      }
      setRoleAssignees(initialAssignees)

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
  const selectableUsers = users.filter((user) => user.id !== writerId)
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

    if (!roleAssignees.final_approver.some((id) => id.trim())) {
      setErrorMessage('최종 결재자를 선택하십시오.')
      return
    }

    if (selectedWriter?.dept_id === null || selectedWriter?.dept_id === undefined) {
      setErrorMessage('선택한 작성자에 부서 정보가 없습니다.')
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

    const participants = normalizeParticipants(
      APPROVAL_ROLES.flatMap((role) =>
        (roleAssignees[role] ?? []).map((userId) => ({ role, userId }))
      )
    )
    const lines = buildApprovalLines(docId, participants)
    const participantRows = buildApprovalParticipantsRows(docId, participants)

    const { error: deleteLinesError } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
    if (deleteLinesError) {
      setIsSaving(false)
      setErrorMessage(getApprovalEditErrorMessage(deleteLinesError))
      return
    }
    if (lines.length > 0) {
      const { error: insertLinesError } = await supabase.from('approval_lines').insert(lines)
      if (insertLinesError) {
        setIsSaving(false)
        setErrorMessage(getApprovalEditErrorMessage(insertLinesError))
        return
      }
    }

    const { error: deleteParticipantsError } = await supabase
      .from('approval_participants')
      .delete()
      .eq('approval_doc_id', docId)
    if (deleteParticipantsError) {
      setIsSaving(false)
      setErrorMessage(getApprovalEditErrorMessage(deleteParticipantsError))
      return
    }
    if (participantRows.length > 0) {
      const { error: participantError } = await supabase.from('approval_participants').insert(participantRows)
      if (participantError) {
        setIsSaving(false)
        setErrorMessage(getApprovalEditErrorMessage(participantError))
        return
      }
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
            <SearchableCombobox
              value={docType}
              onChange={setDocType}
              disabled={!canEdit}
              options={docTypeOptions}
              placeholder="문서유형"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              작성자
            </label>
            <SearchableCombobox
              value={writerId}
              onChange={setWriterId}
              disabled={!canEdit}
              options={users.map((user) => ({
                value: user.id,
                label: `${user.user_name} / ${deptMap.get(user.dept_id ?? -1) ?? '-'} / ${user.role_name}`,
                keywords: [user.user_name, user.login_id, user.role_name, String(deptMap.get(user.dept_id ?? -1) ?? '')],
              }))}
              placeholder="작성자 선택"
            />
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

          {APPROVAL_ROLES.map((role) => (
            <div key={role}>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {getApprovalRoleLabel(role)}
                {role === 'final_approver' ? ' (필수)' : ''}
              </label>
              <div className="space-y-2">
                <input
                  value={roleSearches[role] ?? ''}
                  onChange={(e) =>
                    setRoleSearches((prev) => ({
                      ...prev,
                      [role]: e.target.value,
                    }))
                  }
                  placeholder={`${getApprovalRoleLabel(role)} 검색 (이름/ID/부서)`}
                  disabled={!canEdit}
                  className="w-full rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500 disabled:bg-gray-100"
                />
                {(roleAssignees[role] ?? ['']).map((assignee, idx) => (
                  <div className="flex items-center gap-2" key={`${role}-${idx}`}>
                    <SearchableCombobox
                      value={assignee}
                      onChange={(nextValue) =>
                        setRoleAssignees((prev) => {
                          const next = [...(prev[role] ?? [''])]
                          next[idx] = nextValue
                          return { ...prev, [role]: next }
                        })
                      }
                      disabled={!canEdit}
                      options={(filteredUsersByRole[role] ?? []).map((user) => ({
                        value: user.id,
                        label: `${user.user_name} / ${deptMap.get(user.dept_id ?? -1) ?? '-'} / ${user.role_name}`,
                        keywords: [user.user_name, user.login_id, user.role_name, String(deptMap.get(user.dept_id ?? -1) ?? '')],
                      }))}
                      placeholder={role === 'final_approver' ? '필수 선택' : '선택 안 함'}
                    />
                    {idx > 0 && (
                      <button
                        type="button"
                        disabled={!canEdit}
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
                <button
                  type="button"
                  disabled={!canEdit}
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