'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ApprovalActionButtons from '@/components/ApprovalActionButtons'; 

// --- UI용 Helper 함수들 ---
function getDocStatusLabel(status: string) {
  switch (status) {
    case 'draft': return '임시저장';
    case 'submitted': return '상신';
    case 'in_review': return '결재중';
    case 'approved': return '승인완료';
    case 'rejected': return '반려';
    default: return status;
  }
}

function getDocStatusStyle(status: string) {
  switch (status) {
    case 'draft': return 'bg-gray-100 text-gray-700';
    case 'submitted': return 'bg-blue-100 text-blue-700';
    case 'in_review': return 'bg-yellow-100 text-yellow-700';
    case 'approved': return 'bg-green-100 text-green-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
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

// 🌟 추가된 역할/상태 변환 함수 (결재선 디테일용)
function getRoleName(role: string) {
  if (role === 'drafter') return '기안자';
  if (role === 'review' || role === 'reviewer') return '검토자';
  if (role === 'approve' || role === 'approver') return '결재자';
  return role;
}

function getDetailLineStatus(role: string, status: string) {
  if (role === 'drafter') return <span className="text-gray-600 font-bold">기안완료</span>;

  if (role === 'review' || role === 'reviewer') {
    if (status === 'pending') return <span className="text-blue-600 font-black">검토대기</span>;
    if (status === 'approved') return <span className="text-green-600 font-black">검토완료</span>;
    if (status === 'rejected') return <span className="text-red-600 font-black">반려됨</span>;
    if (status === 'waiting') return <span className="text-gray-400 font-bold">대기</span>;
  }

  if (role === 'approve' || role === 'approver') {
    if (status === 'waiting') return <span className="text-gray-400 font-bold">대기</span>;
    if (status === 'pending') return <span className="text-blue-600 font-black">결재대기</span>;
    if (status === 'approved') return <span className="text-green-600 font-black">결재완료</span>;
    if (status === 'rejected') return <span className="text-red-600 font-black">반려됨</span>;
  }
  return <span className="text-gray-500 font-bold">{status}</span>;
}

export default function OutboundRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: targetId } = use(params);

  const [requestData, setRequestData] = useState<any>(null);
  const [requestItems, setRequestItems] = useState<any[]>([]);
  const [approvalLines, setApprovalLines] = useState<any[]>([]);
  const [approvalHistories, setApprovalHistories] = useState<any[]>([]);
  const [approvalDoc, setApprovalDoc] = useState<any>(null);
  
  // 보안 권한 체크용 상태
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // 유저 및 부서 매핑용
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetailData();
  }, [targetId]);

  const fetchDetailData = async () => {
    try {
      setLoading(true);

      // 1. 현재 로그인한 사용자 및 권한(admin) 확인
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('app_users').select('role_name').eq('id', user.id).single();
      const isAdmin = profile?.role_name === 'admin'; // 최고관리자 마스터키

      // 2. 기초 정보 (유저, 부서) 매핑용 데이터 가져오기
      const [{ data: usersData }, { data: deptsData }] = await Promise.all([
        supabase.from('app_users').select('id, user_name, dept_id'),
        supabase.from('departments').select('id, dept_name')
      ]);
      setUsers(usersData || []);
      setDepartments(deptsData || []);

      // 3. 출고요청 마스터 가져오기
      const { data: header } = await supabase
        .from('outbound_requests')
        .select(`*`)
        .eq('id', targetId).single();

      if (header) {
        setRequestData(header);
        let currentLines: any[] = [];

        // 4. 결재 관련 데이터 (마스터, 결재선, 결재이력)
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

        // 5. 철통 보안 권한 체크 로직
        const isRequester = header.requester_id === user.id;
        const isApprover = currentLines.some(line => line.approver_id === user.id);

        if (!isAdmin && !isRequester && !isApprover) {
          // 최고관리자도, 기안자도, 결재자도 아니면 쫓아냄!
          setHasPermission(false);
          setLoading(false);
          return;
        }

        // 권한 통과!
        setHasPermission(true);

        // 6. 권한이 있는 사람만 품목 리스트 데이터 불러오기
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
  
  // 권한이 없는 사용자가 접근했을 때 보여줄 차단 화면
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-8 font-sans bg-gray-50 min-h-screen">
      
      {/* 상단 헤더 영역 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/outbound-requests" className="text-sm text-gray-500 hover:text-gray-700 font-bold">
            ← 출고요청 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">출고요청서 상세</h1>
          <p className="mt-1 text-gray-600 font-medium">문서 내용과 출고 품목, 결재 흐름을 확인합니다.</p>
        </div>
      </div>

      {/* 2단 레이아웃 시작 */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* 좌측: 문서 본문 영역 */}
        <div className="flex-1 space-y-6">
          
          {/* 1. 문서 기본 정보 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-gray-900">{approvalDoc?.title || requestData.purpose || '제목 없음'}</h2>
                <p className="mt-1 text-sm font-bold text-gray-400">
                  문서번호: {requestData.req_no} / 문서유형: 출고요청서
                </p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold tracking-tight ${getDocStatusStyle(requestData.status)}`}>
                {getDocStatusLabel(requestData.status)}
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

          {/* 2. 출고 요청 품목 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">출고 요청 품목</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
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

          {/* 🌟 3. 결재선 상세 (기안자 포함 풀스토리) 🌟 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">결재선 상세</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
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
                  
                  {/* 1번: 기안자 가상 행 고정 노출 */}
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

                  {/* 2번~: 실제 결재선 (순번을 +1 해서 표시) */}
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

          {/* 4. 결재 이력 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-4 text-xl font-black text-gray-900">결재이력</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
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

        {/* 🌟 우측: 액션 사이드바 영역 (결재 버튼) */}
        <div className="w-full lg:w-[320px] shrink-0">
          <div className="sticky top-6 flex flex-col gap-4">
            
            {/* 결재 처리 모듈 (재고 차감 로직 포함) */}
            {approvalDoc && approvalLines.length > 0 ? (
              <ApprovalActionButtons 
                doc={approvalDoc}
                lines={approvalLines} 
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