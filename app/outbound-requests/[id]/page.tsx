'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ApprovalActionButtons from '@/components/ApprovalActionButtons'; 

// --- UI용 Helper 함수들 ---
// 🌟 목록 페이지와 완전히 동일한 초정밀 상태 배지 함수
function getDetailedStatus(doc: any, lines: any[], reqStatus: string) {
  if (!doc) {
    if (reqStatus === 'draft') return { label: '작성중', style: 'bg-gray-100 text-gray-600 font-bold border border-gray-200' };
    if (reqStatus === 'cancelled') return { label: '취소 완료', style: 'bg-gray-200 text-gray-500 font-bold line-through border border-gray-300' };
    return { label: reqStatus, style: 'bg-gray-100 text-gray-700' };
  }

  if (doc.remarks === '취소 요청 중') return { label: '취소 요청', style: 'bg-red-100 text-red-700 font-black animate-pulse border border-red-200' };
  if (doc.remarks?.includes('취소완료') || doc.remarks?.includes('취소승인')) return { label: '취소 진행중', style: 'bg-orange-100 text-orange-700 font-bold border border-orange-200' };
  if (doc.status === 'rejected' && doc.remarks?.includes('재고환원')) return { label: '취소 완료', style: 'bg-gray-200 text-gray-500 font-bold line-through border border-gray-300' };
  if (doc.status === 'rejected') return { label: '반려됨', style: 'bg-red-50 text-red-600 font-bold border border-red-100' };

  if (doc.status === 'in_review' || doc.status === 'submitted') {
    const approvedLines = lines?.filter((l: any) => l.status === 'approved') || [];
    if (approvedLines.length > 0) {
      const lastApproved = approvedLines[approvedLines.length - 1];
      const roleLabel = lastApproved.approver_role === 'review' ? '검토자' : '결재자';
      return { label: `${roleLabel} 승인`, style: 'bg-blue-100 text-blue-700 font-bold border border-blue-200 shadow-sm' };
    }
    return { label: '결재 진행중', style: 'bg-yellow-100 text-yellow-700 font-bold border border-yellow-200' };
  }

  if (reqStatus === 'completed') return { label: '출고 완료', style: 'bg-purple-100 text-purple-700 font-black border border-purple-200 shadow-sm' };
  if (reqStatus === 'cancelled') return { label: '취소 완료', style: 'bg-gray-200 text-gray-500 font-bold line-through border border-gray-300' };
  if (doc.status === 'approved') return { label: '최종 승인', style: 'bg-green-100 text-green-700 font-black border border-green-200 shadow-sm' };
  if (doc.status === 'draft') return { label: '임시저장', style: 'bg-gray-100 text-gray-600 font-bold border border-gray-200' };
  if (doc.status === 'submitted') return { label: '상신 (대기)', style: 'bg-blue-50 text-blue-600 font-bold border border-blue-100' };

  return { label: reqStatus, style: 'bg-gray-100 text-gray-700' };
}

function getActionLabel(actionType: string) {
  switch (actionType) {
    case 'submit': return '상신';
    case 'approve': return '승인';
    case 'reject': return '반려';
    case 'recall': return '회수';
    default: return actionType;
  }
}

function getRoleName(role: string) {
  if (role === 'drafter') return '기안자';
  if (role === 'review' || role === 'reviewer') return '검토자';
  if (role === 'approve' || role === 'approver') return '결재자';
  return role || '미상'; 
}

function getDetailLineStatus(role: string, status: string) {
  const safeStatus = status || 'waiting'; 

  if (role === 'drafter') return <span className="text-gray-600 font-bold">기안완료</span>;

  if (role === 'review' || role === 'reviewer') {
    if (safeStatus === 'pending') return <span className="text-blue-600 font-black">검토대기</span>;
    if (safeStatus === 'approved') return <span className="text-green-600 font-black">검토완료</span>;
    if (safeStatus === 'rejected') return <span className="text-red-600 font-black">반려됨</span>;
    if (safeStatus === 'waiting') return <span className="text-gray-400 font-bold">대기</span>;
  }

  if (role === 'approve' || role === 'approver') {
    if (safeStatus === 'waiting') return <span className="text-gray-400 font-bold">대기</span>;
    if (safeStatus === 'pending') return <span className="text-blue-600 font-black">결재대기</span>;
    if (safeStatus === 'approved') return <span className="text-green-600 font-black">결재완료</span>;
    if (safeStatus === 'rejected') return <span className="text-red-600 font-black">반려됨</span>;
  }
  return <span className="text-gray-500 font-bold">{safeStatus}</span>;
}

export default function OutboundRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: targetId } = use(params);

  const [requestData, setRequestData] = useState<any>(null);
  const [requestItems, setRequestItems] = useState<any[]>([]);
  const [approvalLines, setApprovalLines] = useState<any[]>([]);
  const [approvalHistories, setApprovalHistories] = useState<any[]>([]);
  const [approvalDoc, setApprovalDoc] = useState<any>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetailData();
  }, [targetId]);

  const fetchDetailData = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('app_users').select('role_name').eq('id', user.id).single();
      const isAdmin = profile?.role_name === 'admin';

      const [{ data: usersData }, { data: deptsData }] = await Promise.all([
        supabase.from('app_users').select('id, user_name, dept_id'),
        supabase.from('departments').select('id, dept_name')
      ]);
      setUsers(usersData || []);
      setDepartments(deptsData || []);

      const { data: header } = await supabase
        .from('outbound_requests')
        .select(`*`)
        .eq('id', targetId).single();

      if (header) {
        setRequestData(header);
        let currentLines: any[] = [];

        if (header.approval_doc_id) {
          const { data: doc } = await supabase
            .from('approval_docs')
            .select('*')
            .eq('id', header.approval_doc_id).single();
          setApprovalDoc(doc);

          const { data: lines } = await supabase
            .from('approval_lines')
            .select(`*`)
            .eq('approval_doc_id', header.approval_doc_id)
            .order('line_no', { ascending: true });
          currentLines = lines || [];
          setApprovalLines(currentLines);

          const { data: histories } = await supabase
            .from('approval_histories')
            .select('*')
            .eq('approval_doc_id', header.approval_doc_id)
            .order('action_at', { ascending: true });
          setApprovalHistories(histories || []);
        }

        const isRequester = header.requester_id === user.id;
        const isApprover = currentLines.some(line => line.approver_id === user.id);

        if (!isAdmin && !isRequester && !isApprover) {
          setHasPermission(false);
          setLoading(false);
          return;
        }

        setHasPermission(true);

        const { data: items } = await supabase
          .from('outbound_request_items')
          .select(`*, item:items(item_code, item_name, item_spec, unit)`)
          .eq('outbound_request_id', header.id)
          .order('line_no', { ascending: true });
        setRequestItems(items || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold">데이터를 불러오는 중입니다...</div>;
  
  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-gray-50 font-sans">
        <div className="p-10 bg-white rounded-3xl shadow-sm text-center border border-red-100 max-w-md">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-black text-red-600 mb-3 tracking-tight">접근 권한 없음</h1>
          <p className="text-gray-500 font-bold mb-8 text-sm leading-relaxed">
            이 문서를 열람할 권한이 없습니다.<br/>
            최고관리자이거나, 본인이 기안/결재하는 문서만<br/>확인할 수 있습니다.
          </p>
          <button 
            onClick={() => router.push('/outbound-requests')} 
            className="w-full px-6 py-3.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (!requestData) return <div className="p-10 text-center text-red-500 font-bold">요청서를 찾을 수 없습니다.</div>;

  const userMap = new Map(users.map(u => [u.id, u.user_name]));
  const userDeptMap = new Map(users.map(u => [u.id, u.dept_id]));
  const deptMap = new Map(departments.map(d => [d.id, d.dept_name]));

  const requesterName = userMap.get(requestData.requester_id) || '-';
  const requesterDeptId = userDeptMap.get(requestData.requester_id);
  const requesterDeptName = deptMap.get(requesterDeptId) || '-';

  // 🌟 동적으로 배지 상태를 계산합니다
  const statusInfo = getDetailedStatus(approvalDoc, approvalLines, requestData.status);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-8 font-sans bg-gray-50 min-h-screen">
      
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/outbound-requests" className="text-sm text-gray-500 hover:text-gray-700 font-bold">
            ← 출고요청 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">출고요청서 상세</h1>
          <p className="mt-1 text-gray-600 font-medium">문서 내용과 출고 품목, 결재 흐름을 확인합니다.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* 좌측 영역 */}
        <div className="flex-1 space-y-6">
          
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-gray-900">{approvalDoc?.title || requestData.purpose || '제목 없음'}</h2>
                <p className="mt-1 text-sm font-bold text-gray-400">
                  문서번호: {requestData.req_no} / 문서유형: 출고요청서
                </p>
              </div>
              {/* 🌟 이 부분에 초정밀 배지가 적용되었습니다 */}
              <span className={`inline-flex rounded-full px-3 py-1 text-sm tracking-tight uppercase ${statusInfo.style}`}>
                {statusInfo.label}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 border-t border-b border-gray-100 py-6">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">기안자</p>
                <p className="mt-1 font-black text-gray-800">{requesterName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">부서</p>
                <p className="mt-1 font-black text-gray-800">{requesterDeptName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">현재 결재순번</p>
                <p className="mt-1 font-black text-gray-800">{approvalDoc?.current_line_no ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">작성일시</p>
                <p className="mt-1 font-black text-gray-800">
                  {new Date(requestData.created_at).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-gray-50 p-5 border border-gray-100">
              <p className="mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">요청 사유 (목적)</p>
              <p className="whitespace-pre-wrap text-gray-800 font-medium leading-relaxed">
                {requestData.purpose || '내용 없음'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">출고 요청 품목</h2>
            {/* 🌟 모바일 가로 스크롤 적용 */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">No.</th>
                    <th className="px-4 py-3 font-bold">품목코드</th>
                    <th className="px-4 py-3 font-bold">품목명</th>
                    <th className="px-4 py-3 font-bold">규격 / 단위</th>
                    <th className="px-4 py-3 font-bold text-right">요청 수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requestItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 font-bold">등록된 품목이 없습니다.</td>
                    </tr>
                  ) : (
                    requestItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-400">{item.line_no || idx + 1}</td>
                        <td className="px-4 py-3 font-black text-blue-600">{item.item?.item_code}</td>
                        <td className="px-4 py-3 font-bold text-gray-800">{item.item?.item_name}</td>
                        <td className="px-4 py-3 font-medium text-gray-500">{item.item?.item_spec || '-'} / {item.item?.unit}</td>
                        <td className="px-4 py-3 font-black text-red-500 text-lg text-right">{item.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">결재선 상세</h2>
            {/* 🌟 모바일 가로 스크롤 적용 */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">순번</th>
                    <th className="px-4 py-3 font-bold">결재자</th>
                    <th className="px-4 py-3 font-bold">역할</th>
                    <th className="px-4 py-3 font-bold">상태</th>
                    <th className="px-4 py-3 font-bold">처리일시</th>
                    <th className="px-4 py-3 font-bold">의견</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  
                  <tr className="bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-500">1</td>
                    <td className="px-4 py-3 font-black text-gray-800">{requesterName}</td>
                    <td className="px-4 py-3 font-bold text-gray-600">{getRoleName('drafter')}</td>
                    <td className="px-4 py-3">{getDetailLineStatus('drafter', 'draft_completed')}</td>
                    <td className="px-4 py-3 font-medium text-gray-500">
                      {new Date(requestData.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-400">기안 상신</td>
                  </tr>

                  {approvalLines.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-500">{line.line_no + 1}</td>
                      <td className="px-4 py-3 font-black text-gray-800">{userMap.get(line.approver_id) ?? '-'}</td>
                      <td className="px-4 py-3 font-bold text-gray-600">{getRoleName(line.approver_role)}</td>
                      <td className="px-4 py-3">
                        {getDetailLineStatus(line.approver_role, line.status)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-500">
                        {line.acted_at ? new Date(line.acted_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-600">{line.opinion ?? '-'}</td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">결재이력</h2>
            {/* 🌟 모바일 가로 스크롤 적용 */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">행동</th>
                    <th className="px-4 py-3 font-bold">처리자</th>
                    <th className="px-4 py-3 font-bold">의견</th>
                    <th className="px-4 py-3 font-bold">처리일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {approvalHistories.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400 font-bold">결재 이력이 없습니다.</td>
                    </tr>
                  ) : (
                    approvalHistories.map((history) => (
                      <tr key={history.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-black text-gray-700">{getActionLabel(history.action_type)}</td>
                        <td className="px-4 py-3 font-bold text-gray-800">{userMap.get(history.actor_id) ?? '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-600">{history.action_comment ?? '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-500">
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

        {/* 우측: 액션 사이드바 영역 */}
        <div className="w-full lg:w-[320px] shrink-0">
          <div className="sticky top-6 flex flex-col gap-4">
            
            {approvalDoc ? (
              <ApprovalActionButtons 
                doc={approvalDoc}
                lines={approvalLines || []} 
              />
            ) : (
              <div className="bg-gray-100 p-4 rounded-xl text-center text-sm font-bold text-gray-500">
                결재 정보가 로딩중이거나 없습니다.
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}