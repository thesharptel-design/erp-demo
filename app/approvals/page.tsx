import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type ApprovalDocRow = {
  id: number
  doc_no: string
  doc_type: string
  title: string
  status: string
  current_line_no: number | null
  drafted_at: string
  submitted_at: string | null
  completed_at: string | null
  remarks: string | null
  app_users: {
    user_name: string
  } | null
  departments: {
    dept_name: string
  } | null
}

async function getApprovalDocs() {
  const { data, error } = await supabase
    .from('approval_docs')
    .select(`
      id,
      doc_no,
      doc_type,
      title,
      status,
      current_line_no,
      drafted_at,
      submitted_at,
      completed_at,
      remarks,
      app_users:writer_id (
        user_name
      ),
      departments (
        dept_name
      )
    `)
    .order('id', { ascending: false })

  if (error) {
    console.error('approval_docs error:', error.message)
    return []
  }

  return (data as unknown as ApprovalDocRow[]) ?? []
}

function getStatusLabel(status: string) {
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

function getStatusStyle(status: string) {
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

export default async function ApprovalsPage() {
  const docs = await getApprovalDocs()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">기안/결재</h1>
          <p className="mt-1 text-gray-600">
            기안 문서 및 결재 상태를 조회합니다.
          </p>
        </div>
        <Link href="/approvals/new" className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
            기안서 작성
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">문서번호</th>
              <th className="px-4 py-3">문서유형</th>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3">작성자</th>
              <th className="px-4 py-3">부서</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">현재순번</th>
              <th className="px-4 py-3">작성일시</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  기안 문서 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/approvals/${doc.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {doc.doc_no}
                    </Link>
                  </td>

                  <td className="px-4 py-3">{doc.doc_type}</td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/approvals/${doc.id}`}
                      className="hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </td>

                  <td className="px-4 py-3">
                    {doc.app_users?.user_name ?? '-'}
                  </td>

                  <td className="px-4 py-3">
                    {doc.departments?.dept_name ?? '-'}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusStyle(
                        doc.status
                      )}`}
                    >
                      {getStatusLabel(doc.status)}
                    </span>
                  </td>

                  <td className="px-4 py-3">{doc.current_line_no ?? '-'}</td>

                  <td className="px-4 py-3">
                    {new Date(doc.drafted_at).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}