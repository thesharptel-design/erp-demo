import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import ApprovalActionButtons from '@/components/ApprovalActionButtons'
import { getApprovalRoleLabel } from '@/lib/approval-roles'

// --- 타입 정의 ---
type ApprovalDoc = {
  id: number;
  doc_no: string;
  doc_type: string;
  title: string;
  content: string | null;
  execution_start_date: string | null;
  execution_end_date: string | null;
  cooperation_dept: string | null;
  agreement_text: string | null;
  status: string;
  current_line_no: number | null;
  drafted_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  remarks: string | null;
  writer_id: string;
  dept_id: number;
}

type ApprovalLine = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
  acted_at?: string | null
}

type ApprovalParticipant = {
  user_id: string
  role: string
  line_no: number
}

type AppUserProfile = {
  id: string
  user_name: string | null
  dept_id: number | null
  role_name: string | null
  seal_image_path: string | null
}

// --- UI Helper 함수들 ---
function getDocStatusLabel(status: string) {
  switch (status) {
    case 'draft': return '임시저장'
    case 'submitted': return '상신 완료'
    case 'in_review': return '검토/결재 중'
    case 'approved': return '최종 승인'
    case 'rejected': return '반려/취소'
    default: return status
  }
}

function getActionLabel(actionType: string) {
  switch (actionType) {
    case 'submit': return '상신'
    case 'approve': return '승인'
    case 'reject': return '반려'
    case 'recall': return '회수'
    case 'cancel': return '취소'
    default: return actionType
  }
}

function getRoleName(role: string) {
  if (role === 'drafter') return '기안자';
  return getApprovalRoleLabel(role);
}

function getIsAdmin(users: any[], currentUserId: string | null) {
  if (!currentUserId) return false
  const currentUserProfile = users.find((u: any) => u.id === currentUserId)
  return String(currentUserProfile?.role_name || '').toLowerCase() === 'admin'
}

function canViewDoc(params: {
  isAdmin: boolean
  currentUserId: string | null
  writerId: string
  lines: any[]
  participants: any[]
}) {
  const { isAdmin, currentUserId, writerId, lines, participants } = params
  if (isAdmin) return true
  if (!currentUserId) return false
  if (writerId === currentUserId) return true
  if (lines.some((l: any) => l.approver_id === currentUserId)) return true
  if (participants.some((p: any) => p.user_id === currentUserId)) return true
  return false
}

function getDetailLineStatus(role: string, status: string) {
  if (role === 'drafter') return <span className="text-gray-600 font-bold">기안완료</span>;
  if (status === 'pending') return <span className="text-blue-600 font-black">대기중</span>;
  if (status === 'approved') return <span className="text-green-600 font-black">승인</span>;
  if (status === 'rejected') return <span className="text-red-600 font-black">반려</span>;
  return <span className="text-gray-400 font-bold">대기</span>;
}

function renderSealStamp(name: string, sealImageUrl: string | null) {
  if (sealImageUrl) {
    return (
      <img
        src={sealImageUrl}
        alt={`${name} 도장`}
        className="mx-auto h-12 w-12 rounded-full border border-red-200 object-cover"
      />
    )
  }

  const initials = name ? name.slice(0, 2) : '--'
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-400 text-[11px] font-black text-red-600">
      {initials}
    </div>
  )
}

// --- 데이터 로직 ---
async function getApprovalDetail(supabase: SupabaseClient, id: string) {
  const docId = Number(id)
  if (Number.isNaN(docId)) return null

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  const [
    { data: doc, error: docError },
    { data: users },
    { data: departments },
    { data: lines },
    { data: histories },
    { data: participants },
  ] = await Promise.all([
    supabase.from('approval_docs').select('*').eq('id', docId).single(),
    supabase.from('app_users').select('id, user_name, dept_id, role_name, seal_image_path'),
    supabase.from('departments').select('id, dept_name'),
    supabase.from('approval_lines').select('*').eq('approval_doc_id', docId).order('line_no'),
    supabase.from('approval_histories').select('*').eq('approval_doc_id', docId).order('action_at'),
    supabase.from('approval_participants').select('user_id, role, line_no').eq('approval_doc_id', docId).order('line_no'),
  ])

  if (docError) return null

  const isAdmin = getIsAdmin(users ?? [], currentUserId)
  const canView = canViewDoc({
    isAdmin,
    currentUserId,
    writerId: (doc as ApprovalDoc).writer_id,
    lines: lines ?? [],
    participants: participants ?? [],
  })
  if (!canView) return null

  return {
    doc: doc as ApprovalDoc,
    users: (users as AppUserProfile[]) ?? [],
    departments: departments ?? [],
    lines: (lines as ApprovalLine[]) ?? [],
    participants: (participants as ApprovalParticipant[]) ?? [],
    histories: histories ?? [],
    currentUserId,
    currentUserRole: isAdmin ? 'admin' : 'user'
  }
}

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  const docId = Number(id)
  if (Number.isNaN(docId)) notFound()

  const { data: head } = await supabase.from('approval_docs').select('id, doc_type').eq('id', docId).single()
  if (!head) notFound()
  if (head.doc_type === 'outbound_request') {
    const { data: req } = await supabase.from('outbound_requests').select('id').eq('approval_doc_id', docId).maybeSingle()
    if (req?.id != null) redirect(`/outbound-requests/${req.id}`)
  }

  const result = await getApprovalDetail(supabase, id)

  if (!result) notFound()

  const { doc, users, departments, lines, participants, histories } = result

  const userMap = new Map(users.map((u) => [u.id, u]))
  const deptMap = new Map(departments.map((d: any) => [d.id, d.dept_name]))
  const draftedDate = new Date(doc.drafted_at).toISOString().split('T')[0]
  const lineMapByNo = new Map(lines.map((line) => [line.line_no, line]))
  const displayLines =
    participants.length > 0
      ? participants.map((participant) => {
          const matchedLine = lineMapByNo.get(participant.line_no)
          return {
            line_no: participant.line_no,
            approver_id: participant.user_id,
            approver_role: participant.role,
            status: matchedLine?.status ?? 'waiting',
            acted_at: matchedLine?.acted_at ?? null,
          }
        })
      : lines.map((line) => ({
          line_no: line.line_no,
          approver_id: line.approver_id,
          approver_role: line.approver_role,
          status: line.status,
          acted_at: line.acted_at ?? null,
        }))
  const cooperativeLines = displayLines.filter((line) => line.approver_role === 'cooperator')
  const signLines = displayLines.filter((line) => line.approver_role !== 'cooperator')
  const writerProfile = userMap.get(doc.writer_id)
  const sealUrlMap = new Map<string, string>()
  for (const user of users) {
    if (!user.seal_image_path) continue
    const { data } = supabase.storage.from('user-seals').getPublicUrl(user.seal_image_path)
    if (data?.publicUrl) {
      sealUrlMap.set(user.id, data.publicUrl)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      
      <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">기안서 상세내역</h1>
            {doc.remarks?.includes('취소 요청') && (
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black animate-pulse">취소 요청 접수됨</span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-500 mt-2">
            문서번호: {doc.doc_no} | 기안일: {draftedDate}
          </p>
        </div>
        <Link href="/approvals" className="px-5 py-2.5 text-sm font-bold text-gray-900 bg-white border-2 border-black rounded-lg hover:bg-gray-50 shadow-sm transition-all">
          목록으로
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center mb-5">
              <div className="w-1.5 h-5 bg-blue-600 rounded-full mr-2"></div>
              <h2 className="text-lg font-black text-gray-800">문서 기본 정보</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="border border-gray-100 bg-gray-50 rounded-xl p-4 flex flex-col justify-center">
                <p className="text-xs font-bold text-gray-400 mb-1">기안자</p>
                <p className="font-black text-gray-800 text-lg">
                  {writerProfile?.user_name || doc.writer_id.slice(0,8)} 
                  <span className="text-sm font-medium text-gray-500 ml-1">({deptMap.get(doc.dept_id) ?? '-'})</span>
                </p>
              </div>
              <div className="border border-gray-100 bg-gray-50 rounded-xl p-4 flex flex-col justify-center">
                <p className="text-xs font-bold text-gray-400 mb-1">진행 상태</p>
                <p className={`font-black text-lg ${doc.status === 'approved' ? 'text-green-600' : doc.status === 'rejected' ? 'text-red-600' : 'text-blue-600'}`}>
                  {getDocStatusLabel(doc.status)}
                </p>
              </div>
            </div>
            <div className="border border-gray-100 bg-gray-50 rounded-xl p-5">
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold text-gray-500">시행일자</p>
                  <p className="text-sm font-bold text-gray-800">
                    {doc.execution_start_date || '-'} ~ {doc.execution_end_date || '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold text-gray-500">협조부서</p>
                  <p className="text-sm font-bold text-gray-800">{doc.cooperation_dept || '-'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 md:col-span-2">
                  <p className="text-[11px] font-bold text-gray-500">합의</p>
                  <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap">{doc.agreement_text || '-'}</p>
                </div>
              </div>
              <p className="text-base font-black text-gray-800 mb-4 pb-3 border-b border-gray-200">제목: {doc.title}</p>
              <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                {doc.content ?? '내용 없음'}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center mb-5">
              <div className="w-1.5 h-5 bg-green-500 rounded-full mr-2"></div>
              <h2 className="text-lg font-black text-gray-800">결재선 현황</h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-bold">순번</th>
                    <th className="px-4 py-3 font-bold">결재자</th>
                    <th className="px-4 py-3 font-bold">역할</th>
                    <th className="px-4 py-3 font-bold">상태</th>
                    <th className="px-4 py-3 font-bold">처리일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50/30 align-top">
                    <td className="px-4 py-3 font-bold text-gray-400">0</td>
                    <td className="px-4 py-3 font-black">
                      <div className="space-y-2">
                        <p>{writerProfile?.user_name || '기안자'}</p>
                        {renderSealStamp(writerProfile?.user_name || '기안자', sealUrlMap.get(doc.writer_id) ?? null)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-500 text-xs">기안자</td>
                    <td className="px-4 py-3">{getDetailLineStatus('drafter', 'approved')}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(doc.drafted_at).toLocaleString('ko-KR')}</td>
                  </tr>
                  {signLines.map((line) => {
                    const profile = userMap.get(line.approver_id)
                    const userName = profile?.user_name ?? '-'
                    return (
                    <tr key={`${line.line_no}-${line.approver_id}-${line.approver_role}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-400">{line.line_no}</td>
                      <td className="px-4 py-3 font-black text-gray-800">
                        <div className="space-y-2">
                          <p>{userName}</p>
                          {renderSealStamp(userName, sealUrlMap.get(line.approver_id) ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-500 text-xs uppercase">{getRoleName(line.approver_role)}</td>
                      <td className="px-4 py-3">{getDetailLineStatus(line.approver_role, line.status)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{line.acted_at ? new Date(line.acted_at).toLocaleString('ko-KR') : '-'}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center mb-5">
              <div className="w-1.5 h-5 bg-amber-500 rounded-full mr-2"></div>
              <h2 className="text-lg font-black text-gray-800">협조 정보</h2>
            </div>
            {cooperativeLines.length === 0 ? (
              <p className="text-sm font-bold text-gray-500">등록된 협조자가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {cooperativeLines.map((line) => (
                  <div
                    key={`cooperator-${line.line_no}-${line.approver_id}`}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-black text-gray-800">
                        {userMap.get(line.approver_id)?.user_name ?? '-'}
                      </p>
                      <p className="text-[11px] font-bold text-gray-500">순번 {line.line_no} / 협조</p>
                    </div>
                    <div>{getDetailLineStatus(line.approver_role, line.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-[320px] shrink-0">
          <div className="sticky top-6 flex flex-col gap-4">
            {/* 🌟 버튼 컴포넌트에 권한 정보를 확실하게 주입합니다. */}
            <ApprovalActionButtons 
              doc={doc} 
              lines={lines} 
              participants={participants}
            />

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-black text-gray-400 mb-4 uppercase tracking-wider">최근 처리 이력</p>
                <div className="space-y-4">
                    {histories.slice(-3).reverse().map((h: any) => (
                        <div key={h.id} className="border-l-2 border-gray-100 pl-3 py-1">
                            <p className="text-xs font-black text-gray-800">{getActionLabel(h.action_type)}</p>
                            <p className="text-[10px] font-bold text-gray-400">{userMap.get(h.actor_id)?.user_name ?? '-'} | {new Date(h.action_at).toLocaleDateString()}</p>
                        </div>
                    ))}
                    {histories.length === 0 && <p className="text-xs text-gray-400 font-bold">처리 이력이 없습니다.</p>}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}