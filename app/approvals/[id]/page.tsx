import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ApprovalActionButtons from '@/components/ApprovalActionButtons'

type ApprovalDoc = {
  id: number
  doc_no: string
  doc_type: string
  title: string
  content: string | null
  status: string
  current_line_no: number | null
  drafted_at: string
  submitted_at: string | null
  completed_at: string | null
  remarks: string | null
  writer_id: string
  dept_id: number
}

type AppUser = {
  id: string
  user_name: string
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
  acted_at: string | null
  opinion: string | null
}

type ApprovalHistory = {
  id: number
  approval_doc_id: number
  approval_line_id: number | null
  actor_id: string
  action_type: string
  action_comment: string | null
  action_at: string
}

async function getApprovalDetail(id: string) {
  const docId = Number(id)
  if (Number.isNaN(docId)) return null

  const [
    { data: doc, error: docError },
    { data: users, error: usersError },
    { data: departments, error: departmentsError },
    { data: lines, error: linesError },
    { data: histories, error: historiesError },
  ] = await Promise.all([
    supabase.from('approval_docs').select('*').eq('id', docId).single(),
    supabase.from('app_users').select('id, user_name'),
    supabase.from('departments').select('id, dept_name'),
    supabase
      .from('approval_lines')
      .select('*')
      .eq('approval_doc_id', docId)
      .order('line_no'),
    supabase
      .from('approval_histories')
      .select('*')
      .eq('approval_doc_id', docId)
      .order('action_at'),
  ])

  if (docError) {
    console.error('approval_docs error:', docError.message)
    return null
  }

  if (usersError) console.error('app_users error:', usersError.message)
  if (departmentsError) console.error('departments error:', departmentsError.message)
  if (linesError) console.error('approval_lines error:', linesError.message)
  if (historiesError) console.error('approval_histories error:', historiesError.message)

  return {
    doc: doc as ApprovalDoc,
    users: (users as AppUser[]) ?? [],
    departments: (departments as Department[]) ?? [],
    lines: (lines as ApprovalLine[]) ?? [],
    histories: (histories as ApprovalHistory[]) ?? [],
  }
}

function getDocStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '임시저장'
    case 'submitted':
      return '상신'
    case 'in_review':
      return '결재중'
    case 'approved':
      return '승인'
    case 'rejected':
      return '반려'
    default:
      return status
  }
}

function getDocStatusStyle(status: string) {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700'
    case 'submitted':
      return 'bg-blue-100 text-blue-700'
    case 'in_review':
      return 'bg-yellow-100 text-yellow-700'
    case 'approved':
      return 'bg-green-100 text-green-700'
    case 'rejected':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function getLineStatusLabel(status: string) {
  switch (status) {
    case 'waiting':
      return '대기'
    case 'pending':
      return '진행중'
    case 'approved':
      return '승인'
    case 'rejected':
      return '반려'
    case 'skipped':
      return '건너뜀'
    default:
      return status
  }
}

function getActionLabel(actionType: string) {
  switch (actionType) {
    case 'submit':
      return '상신'
    case 'approve':
      return '승인'
    case 'reject':
      return '반려'
    case 'recall':
      return '회수'
    default:
      return actionType
  }
}

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getApprovalDetail(id)

  if (!result) notFound()

  const { doc, users, departments, lines, histories } = result

  const userMap = new Map(users.map((user) => [user.id, user.user_name]))
  const deptMap = new Map(departments.map((dept) => [dept.id, dept.dept_name]))

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
          <h1 className="mt-2 text-3xl font-bold">기안서 상세</h1>
          <p className="mt-1 text-gray-600">
            문서 내용과 결재 흐름을 확인합니다.
          </p>
        </div>

      <div className="flex flex-col gap-2">
        <Link href={`/approvals/${doc.id}/edit`} className="rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700">
            수정
        </Link>

        <ApprovalActionButtons
            docId={doc.id}
            docNo={doc.doc_no}
            lines={lines}
        />
      </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{doc.title}</h2>
            <p className="mt-1 text-sm text-gray-500">
              문서번호: {doc.doc_no} / 문서유형: {doc.doc_type}
            </p>
          </div>

          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getDocStatusStyle(
              doc.status
            )}`}
          >
            {getDocStatusLabel(doc.status)}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-sm text-gray-500">작성자</p>
            <p className="mt-1 font-medium">{userMap.get(doc.writer_id) ?? '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">부서</p>
            <p className="mt-1 font-medium">{deptMap.get(doc.dept_id) ?? '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">현재 결재순번</p>
            <p className="mt-1 font-medium">{doc.current_line_no ?? '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">작성일시</p>
            <p className="mt-1 font-medium">
              {new Date(doc.drafted_at).toLocaleString('ko-KR')}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-gray-50 p-4">
          <p className="mb-2 text-sm text-gray-500">내용</p>
          <p className="whitespace-pre-wrap text-gray-800">
            {doc.content ?? '내용 없음'}
          </p>
        </div>

        {doc.remarks && (
          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="mb-2 text-sm text-gray-500">비고</p>
            <p className="text-gray-800">{doc.remarks}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">결재선</h2>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">순번</th>
                <th className="px-4 py-3">결재자</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">처리일시</th>
                <th className="px-4 py-3">의견</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    결재선 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <tr key={line.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{line.line_no}</td>
                    <td className="px-4 py-3">{userMap.get(line.approver_id) ?? '-'}</td>
                    <td className="px-4 py-3">{line.approver_role}</td>
                    <td className="px-4 py-3">{getLineStatusLabel(line.status)}</td>
                    <td className="px-4 py-3">
                      {line.acted_at
                        ? new Date(line.acted_at).toLocaleString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">{line.opinion ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">결재이력</h2>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">행동</th>
                <th className="px-4 py-3">처리자</th>
                <th className="px-4 py-3">의견</th>
                <th className="px-4 py-3">처리일시</th>
              </tr>
            </thead>
            <tbody>
              {histories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    결재 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                histories.map((history) => (
                  <tr key={history.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{getActionLabel(history.action_type)}</td>
                    <td className="px-4 py-3">
                      {userMap.get(history.actor_id) ?? '-'}
                    </td>
                    <td className="px-4 py-3">{history.action_comment ?? '-'}</td>
                    <td className="px-4 py-3">
                      {new Date(history.action_at).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}