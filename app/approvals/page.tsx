'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// --- UI용 Helper 함수들 ---
function getWriterName(appUsers: any) {
  if (!appUsers) return '-';
  if (Array.isArray(appUsers)) {
    return appUsers[0]?.user_name ?? '-';
  }
  return appUsers.user_name ?? '-';
}

function getDeptName(departments: any) {
  if (!departments) return '-';
  if (Array.isArray(departments)) {
    return departments[0]?.dept_name ?? '-';
  }
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

function getStatusLabel(status: string) {
  switch (status) {
    case 'draft': return '임시저장';
    case 'submitted': return '상신';
    case 'in_review': return '결재중';
    case 'approved': return '승인';
    case 'rejected': return '반려';
    default: return status;
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'draft': return 'erp-badge erp-badge-draft';
    case 'submitted': return 'erp-badge erp-badge-progress';
    case 'in_review': return 'erp-badge erp-badge-review';
    case 'approved': return 'erp-badge erp-badge-done';
    case 'rejected': return 'erp-badge erp-badge-danger';
    default: return 'erp-badge erp-badge-draft';
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

      // 🌟 1. 브라우저에서 현재 로그인한 사용자 정보 가져오기 (이제 정상 작동합니다!)
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setDocs([]);
        return;
      }

      // 🌟 2. 사용자 권한(역할) 확인
      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name')
        .eq('id', user.id)
        .single();
      
      const isAdmin = profile?.role_name === 'admin';

      // 🌟 3. 내가 결재선에 포함된 문서 ID 찾기
      let myDocIds: number[] = [];
      if (!isAdmin) {
        const { data: lines } = await supabase
          .from('approval_lines')
          .select('approval_doc_id')
          .eq('approver_id', user.id);
        myDocIds = lines?.map(line => line.approval_doc_id) || [];
      }

      // 🌟 4. 메인 쿼리 작성 (출고요청서 제외)
      let query = supabase
        .from('approval_docs')
        .select(`
          id, doc_no, doc_type, title, status, current_line_no, drafted_at, submitted_at, completed_at, remarks,
          app_users:writer_id (user_name),
          departments:dept_id (dept_name)
        `)
        .neq('doc_type', 'outbound_request')
        .order('id', { ascending: false });

      // 🌟 5. 권한 필터링 적용
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
          className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
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
              <th className="px-5 py-4 text-center">현재결재순번</th>
              <th className="px-5 py-4">기안일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-sm font-bold text-gray-400">
                  데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-sm font-bold text-gray-400">
                  기안/결재 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/approvals/${doc.id}`}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      {doc.doc_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-semibold text-gray-600">{getDocTypeLabel(doc.doc_type)}</td>
                  <td className="px-5 py-4 font-bold">{doc.title}</td>
                  <td className="px-5 py-4">{getWriterName(doc.app_users)}</td>
                  <td className="px-5 py-4">{getDeptName(doc.departments)}</td>
                  <td className="px-5 py-4">
                    <span className={getStatusStyle(doc.status)}>
                      {getStatusLabel(doc.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center font-bold">{doc.current_line_no ?? '-'}</td>
                  <td className="px-5 py-4 text-gray-500 font-medium">{doc.drafted_at?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}