'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// --- UI용 Helper 함수들 ---
function getWriterName(appUsers: any) {
  if (!appUsers) return '-';
  if (Array.isArray(appUsers)) return appUsers[0]?.user_name ?? '-';
  return appUsers.user_name ?? '-';
}

function getDeptName(departments: any) {
  if (!departments) return '-';
  if (Array.isArray(departments)) return departments[0]?.dept_name ?? '-';
  return departments.dept_name ?? '-';
}

function getDocTypeLabel(docType: string) {
  switch (docType) {
    case 'draft_doc': return '일반기안';
    case 'purchase_request': return '구매품의';
    case 'leave_request': return '휴가신청';
    case 'draft': return '기안서';
    case 'purchase': return '구매기안';
    case 'sales': return '영업기안';
    case 'expense': return '지출결의';
    case 'general': return '일반문서';
    default: return docType;
  }
}

// 🌟 [핵심 변경] 역할에 따라 저장된 remarks 텍스트를 그대로 뱃지에 출력!
function getDetailedStatusBadge(doc: any) {
  const remarks = doc.remarks || '';

  // 1. 기안자 취소 요청
  if (remarks.includes('취소 요청 중')) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-600 animate-pulse border border-red-200">기안자 취소요청</span>;
  }
  
  // 2. 역순 릴레이 중 (결재자 취소완료 등)
  if (remarks.includes('취소완료') && !remarks.includes('재고환원')) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-100 text-orange-600 animate-pulse border border-orange-200">{remarks}</span>;
  }

  // 3. 기안자의 마지막 확인 대기 (검토자 취소승인 or 결재자 취소승인)
  if (remarks.includes('취소승인')) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-50 text-orange-500 border border-orange-200">{remarks}</span>;
  }

  // 4. 최종 취소 완료
  if (remarks.includes('재고환원') || remarks.includes('결재 중 취소됨')) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-200 text-gray-500 border border-gray-300">취소 완료됨</span>;
  }

  // 5. 관리자 강제취소
  if (remarks.includes('관리자 강제취소')) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-gray-800 text-white border border-gray-900">관리자 강제취소</span>;
  }

  // --- 일반 결재 프로세스 ---
  switch (doc.status) {
    case 'draft': 
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200">임시저장 (회수)</span>;
    case 'rejected': 
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-red-50 text-red-600 border border-red-200">반려됨</span>;
    case 'approved': 
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-green-100 text-green-700 border border-green-200">최종 승인</span>;
    case 'submitted':
    case 'in_review':
      if (doc.current_line_no === 2) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-600 border border-blue-200">검토자 대기중</span>;
      }
      if (doc.current_line_no >= 3) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200">결재자 대기중</span>;
      }
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-500 border border-blue-100">결재 진행중</span>;
    default: 
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600">{doc.status}</span>;
  }
}

export default function ApprovalsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setDocs([]);
        return;
      }

      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name')
        .eq('id', user.id)
        .single();
      
      const isAdmin = profile?.role_name === 'admin';

      let myDocIds: number[] = [];
      if (!isAdmin) {
        const { data: lines } = await supabase
          .from('approval_lines')
          .select('approval_doc_id')
          .eq('approver_id', user.id);
        myDocIds = lines?.map(line => line.approval_doc_id) || [];
      }

      let query = supabase
        .from('approval_docs')
        .select(`
          id, doc_no, doc_type, title, status, current_line_no, drafted_at, submitted_at, completed_at, remarks,
          app_users:writer_id (user_name),
          departments:dept_id (dept_name)
        `)
        .neq('doc_type', 'outbound_request')
        .order('id', { ascending: false });

      if (!isAdmin) {
        if (myDocIds.length > 0) {
          query = query.or(`writer_id.eq.${user.id},id.in.(${myDocIds.join(',')})`);
        } else {
          query = query.eq('writer_id', user.id);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      setDocs(data || []);
    } catch (error: any) {
      console.error('문서 목록을 불러오는 중 오류 발생:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">기안/결재 (일반)</h1>
          <p className="mt-1 text-sm text-gray-500">
            일반 기안 문서를 확인합니다. (출고요청서는 출고요청 메뉴를 이용하세요)
          </p>
        </div>

        <Link
          href="/approvals/new"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 transition-colors shadow-md"
        >
          기안서 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-black uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-4">문서번호</th>
              <th className="px-5 py-4">문서유형</th>
              <th className="px-5 py-4">제목</th>
              <th className="px-5 py-4">기안자</th>
              <th className="px-5 py-4">부서</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4 text-center">결재순번</th>
              <th className="px-5 py-4">기안일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-sm font-bold text-gray-400">
                  데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-sm font-bold text-gray-400">
                  기안/결재 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/approvals/${doc.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-bold"
                    >
                      {doc.doc_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-semibold text-gray-500 text-xs">{getDocTypeLabel(doc.doc_type)}</td>
                  <td className="px-5 py-4 font-black text-gray-800">{doc.title}</td>
                  <td className="px-5 py-4 font-bold text-gray-600">{getWriterName(doc.app_users)}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs font-bold">{getDeptName(doc.departments)}</td>
                  
                  {/* 🌟 뱃지가 적용된 상태 표시란 */}
                  <td className="px-5 py-4">
                    {getDetailedStatusBadge(doc)}
                  </td>
                  
                  <td className="px-5 py-4 text-center font-black text-gray-400">{doc.current_line_no ?? '-'}</td>
                  <td className="px-5 py-4 text-gray-400 text-xs font-bold tracking-tighter">{doc.drafted_at?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}