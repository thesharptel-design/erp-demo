'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import SearchableCombobox from '@/components/SearchableCombobox';
import {
  getApprovalDocDetailedStatusLabel,
  getApprovalDocDetailedStatusPresentation,
  getDeptName,
  getDocDetailHref,
  getDocTypeLabel,
  getWriterName,
} from '@/lib/approval-status';
import type { ApprovalDocLike } from '@/lib/approval-status';

type ApprovalsDocRow = ApprovalDocLike & {
  id: number;
  doc_no: string | null;
  title: string | null;
  drafted_at: string | null;
  app_users?: { user_name?: string } | { user_name?: string }[] | null;
  departments?: { dept_name?: string } | { dept_name?: string }[] | null;
};

export default function ApprovalsPage() {
  const [docs, setDocs] = useState<ApprovalsDocRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterWriter, setFilterWriter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDraftDate, setFilterDraftDate] = useState('');

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name')
        .eq('id', user.id)
        .single();
      const userIsAdmin = String(profile?.role_name || '').toLowerCase() === 'admin';

      const select = `*, app_users:writer_id(user_name), departments:dept_id(dept_name), outbound_requests(id)`;

      let query = supabase.from('approval_docs').select(select).order('id', { ascending: false });

      if (!userIsAdmin) {
        const { data: participants } = await supabase
          .from('approval_participants')
          .select('approval_doc_id')
          .eq('user_id', user.id);
        const myDocIds = [
          ...new Set((participants ?? []).map((l) => l.approval_doc_id).filter((id): id is number => id != null)),
        ];
        if (myDocIds.length > 0) {
          query = query.or(`writer_id.eq.${user.id},id.in.(${myDocIds.join(',')})`);
        } else {
          query = query.eq('writer_id', user.id);
        }
      }

      const { data } = await query;

      setDocs((data as ApprovalsDocRow[]) || []);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = useMemo(() => {
    const q = (s: string) => s.trim().toLowerCase();
    const docNoQ = q(filterDocNo);
    const titleQ = q(filterTitle);
    const writerQ = q(filterWriter);
    const statusQ = q(filterStatus);
    return docs.filter((doc) => {
      if (docNoQ && !String(doc.doc_no ?? '').toLowerCase().includes(docNoQ)) return false;
      if (filterDocType && doc.doc_type !== filterDocType) return false;
      if (titleQ && !String(doc.title ?? '').toLowerCase().includes(titleQ)) return false;
      const writerName = getWriterName(doc.app_users);
      if (writerQ && !writerName.toLowerCase().includes(writerQ)) return false;
      if (statusQ && !getApprovalDocDetailedStatusLabel(doc).toLowerCase().includes(statusQ)) return false;
      if (filterDraftDate) {
        const day = doc.drafted_at?.slice(0, 10);
        if (day !== filterDraftDate) return false;
      }
      return true;
    });
  }, [docs, filterDocNo, filterDocType, filterTitle, filterWriter, filterStatus, filterDraftDate]);

  const clearFilters = () => {
    setFilterDocNo('');
    setFilterDocType('');
    setFilterTitle('');
    setFilterWriter('');
    setFilterStatus('');
    setFilterDraftDate('');
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">통합 결재문서함</h1>
          <p className="mt-1 text-sm font-bold text-gray-500">
            모든 기안과 출고 요청을 한 곳에서 관리합니다. (관리자가 아니면 내가 기안했거나 결재선에 포함된 문서만 표시)
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/approvals/new"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-white border-2 border-black px-5 text-sm font-black text-black hover:bg-gray-50 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none"
          >
            일반 기안 작성
          </Link>
          <Link
            href="/outbound-requests/new"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 border-2 border-black px-5 text-sm font-black text-white hover:bg-blue-700 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none"
          >
            출고 요청 작성
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold text-gray-500">
        {!loading && docs.length > 0 && (
          <span>
            표시 {filteredDocs.length}건 / 전체 {docs.length}건
          </span>
        )}
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50"
        >
          필터 초기화
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b-2 border-black text-left text-xs font-black uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-5 py-4">문서번호</th>
              <th className="px-5 py-4">유형</th>
              <th className="px-5 py-4">제목</th>
              <th className="px-5 py-4">기안자</th>
              <th className="px-5 py-4 text-center">상태</th>
              <th className="px-5 py-4 text-center">순번</th>
              <th className="px-5 py-4">기안일</th>
            </tr>
            <tr className="border-b border-gray-200 bg-gray-100/80 text-[11px] font-bold normal-case tracking-normal text-gray-600">
              <th className="px-3 py-2 align-middle font-semibold">
                <input
                  type="search"
                  value={filterDocNo}
                  onChange={(e) => setFilterDocNo(e.target.value)}
                  placeholder="포함 검색"
                  className="w-full min-w-[6rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900 placeholder:text-gray-400"
                  aria-label="문서번호 필터"
                />
              </th>
              <th className="px-3 py-2 align-middle font-semibold">
                <SearchableCombobox
                  value={filterDocType}
                  onChange={setFilterDocType}
                  options={[
                    { value: '', label: '전체' },
                    { value: 'draft_doc', label: '일반기안' },
                    { value: 'outbound_request', label: '출고요청' },
                    { value: 'purchase_request', label: '구매품의' },
                    { value: 'leave_request', label: '휴가신청' },
                  ]}
                  placeholder="유형 필터"
                />
              </th>
              <th className="px-3 py-2 align-middle font-semibold">
                <input
                  type="search"
                  value={filterTitle}
                  onChange={(e) => setFilterTitle(e.target.value)}
                  placeholder="포함 검색"
                  className="w-full min-w-[8rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900 placeholder:text-gray-400"
                  aria-label="제목 필터"
                />
              </th>
              <th className="px-3 py-2 align-middle font-semibold">
                <input
                  type="search"
                  value={filterWriter}
                  onChange={(e) => setFilterWriter(e.target.value)}
                  placeholder="이름 포함"
                  className="w-full min-w-[5rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900 placeholder:text-gray-400"
                  aria-label="기안자 필터"
                />
              </th>
              <th className="px-3 py-2 align-middle font-semibold">
                <input
                  type="search"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  placeholder="예: 승인, 반려"
                  className="w-full min-w-[6rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900 placeholder:text-gray-400"
                  aria-label="상태 필터"
                />
              </th>
              <th className="px-3 py-2 align-middle font-semibold text-center text-gray-400">—</th>
              <th className="px-3 py-2 align-middle font-semibold">
                <input
                  type="date"
                  value={filterDraftDate}
                  onChange={(e) => setFilterDraftDate(e.target.value)}
                  className="w-full min-w-[9rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                  aria-label="기안일 필터"
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-20 text-center font-bold text-gray-400">
                  데이터 로딩 중...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-20 text-center font-bold text-gray-400">
                  문서가 없습니다.
                </td>
              </tr>
            ) : filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-20 text-center font-bold text-gray-400">
                  조건에 맞는 문서가 없습니다.
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => {
                const pres = getApprovalDocDetailedStatusPresentation(doc);
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-4 font-black">
                      <Link href={getDocDetailHref(doc)} className="text-blue-600 hover:underline">
                        {doc.doc_no}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-xs font-bold text-gray-400">{getDocTypeLabel(doc.doc_type)}</td>
                    <td className="px-5 py-4 font-black text-gray-800">{doc.title}</td>
                    <td className="px-5 py-4 font-bold text-gray-600">
                      <div className="flex flex-col">
                        <span>{getWriterName(doc.app_users)}</span>
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">
                          {getDeptName(doc.departments)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={pres.className}>{pres.label}</span>
                    </td>
                    <td className="px-5 py-4 text-center font-black text-gray-400">{doc.current_line_no || '-'}</td>
                    <td className="px-5 py-4 text-xs text-gray-400 font-bold">{doc.drafted_at?.slice(0, 10)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
