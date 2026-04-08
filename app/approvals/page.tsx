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
  app_users:
    | {
        user_name: string
      }
    | {
        user_name: string
      }[]
    | null
  departments:
    | {
        dept_name: string
      }
    | {
        dept_name: string
      }[]
    | null
}

async function getApprovalDocs(): Promise<ApprovalDocRow[]> {
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
      departments:dept_id (
        dept_name
      )
    `)
    .order('id', { ascending: false })

  if (error) {
    console.error('approval_docs error:', error.message)
    return []
  }

  return ((data ?? []) as unknown[]) as ApprovalDocRow[]
}

function getWriterName(appUsers: ApprovalDocRow['app_users']) {
  if (!appUsers) return '-'
  if (Array.isArray(appUsers)) {
    return appUsers[0]?.user_name ?? '-'
  }
  return appUsers.user_name ?? '-'
}

function getDeptName(departments: ApprovalDocRow['departments']) {
  if (!departments) return '-'
  if (Array.isArray(departments)) {
    return departments[0]?.dept_name ?? '-'
  }
  return departments.dept_name ?? '-'
}

function getDocTypeLabel(docType: string) {
  switch (docType) {
    case 'draft':
      return '기안서'
    case 'purchase':
      return '구매기안'
    case 'sales':
      return '영업기안'
    case 'expense':
      return '지출결의'
    case 'general':
      return '일반문서'
    default:
      return docType
  }
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
      return 'erp-badge erp-badge-draft'
    case 'submitted':
      return 'erp-badge erp-badge-progress'
    case 'in_review':
      return 'erp-badge erp-badge-review'
    case 'approved':
      return 'erp-badge erp-badge-done'
    case 'rejected':
      return 'erp-badge erp-badge-danger'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

export default async function ApprovalsPage() {
  const docs = await getApprovalDocs()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">기안/결재</h1>
          <p className="mt-1 text-sm text-gray-500">
            모든 사용자는 기안할 수 있고, 결재권자는 승인/반려를 처리합니다.
          </p>
        </div>

        <Link
          href="/approvals/new"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white"
        >
          기안서 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">문서번호</th>
              <th className="px-5 py-4">문서유형</th>
              <th className="px-5 py-4">제목</th>
              <th className="px-5 py-4">기안자</th>
              <th className="px-5 py-4">부서</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4">현재결재순번</th>
              <th className="px-5 py-4">기안일</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-sm text-gray-400">
                  기안/결재 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/approvals/${doc.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {doc.doc_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{getDocTypeLabel(doc.doc_type)}</td>
                  <td className="px-5 py-4">{doc.title}</td>
                  <td className="px-5 py-4">{getWriterName(doc.app_users)}</td>
                  <td className="px-5 py-4">{getDeptName(doc.departments)}</td>
                  <td className="px-5 py-4">
                    <span className={getStatusStyle(doc.status)}>
                      {getStatusLabel(doc.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">{doc.current_line_no ?? '-'}</td>
                  <td className="px-5 py-4">{doc.drafted_at?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
