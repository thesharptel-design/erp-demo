'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SearchableCombobox from '@/components/SearchableCombobox';
import { APPROVAL_DRAFT_DOC_TYPE_OPTIONS } from '@/lib/approval-draft';
import { openApprovalDocFromInbox, openApprovalShellPopup } from '@/lib/approval-popup';
import {
  APPROVAL_INBOX_STATUS_FILTER_OPTIONS,
  formatApprovalProgressChain,
  formatInboxApproverLineDisplay,
  getApprovalDocDetailedStatusPresentation,
  getDocDetailOpenHref,
  getDocTypeLabel,
  getWriterName,
} from '@/lib/approval-status';
import type { ApprovalDocLike, ApprovalLineWithName } from '@/lib/approval-status';
import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions';

type ApprovalsDocRow = ApprovalDocLike & {
  id: number;
  writer_id: string | null;
  dept_id: number | null;
  doc_no: string | null;
  title: string | null;
  drafted_at: string | null;
  completed_at?: string | null;
  recent_reject_comment?: string | null;
  /** `approval_lines.opinion` 등록 여부 */
  hasLineOpinion: boolean;
  /** 상태 뱃지(결재완료·협조대기 등) 계산용 */
  linesForStatusPresentation: Array<{ line_no: number; approver_role: string; status: string }>;
  app_users?: { user_name?: string } | { user_name?: string }[] | null;
  departments?: { dept_name?: string } | { dept_name?: string }[] | null;
  progressLabel: string;
  approverLineNames: string;
};

type InboxRpcItem = {
  id: number;
  doc_no: string | null;
  title: string | null;
  status: string;
  remarks: string | null;
  drafted_at: string | null;
  completed_at: string | null;
  doc_type: string | null;
  writer_id: string | null;
  dept_id: number | null;
  current_line_no: number | null;
  approver_line_names: string;
  writer_user_name: string | null;
  dept_name: string | null;
  outbound_request_id: number | null;
};

type InboxRpcPayload = {
  total: number;
  items: InboxRpcItem[];
};

const DOC_TYPE_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  ...APPROVAL_DRAFT_DOC_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  { value: 'outbound_request', label: '출고요청' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const COMBO_EMPTY = [{ value: '', label: '전체' }];

function inboxDisplayText(value: string | null | undefined, empty = '—') {
  const s = value == null ? '' : String(value).trim();
  return s || empty;
}

/** 말줄임 + 브라우저 기본 툴팁(호버·포커스 시 전체 문구) */
function InboxTruncated({
  text,
  className,
  empty,
}: {
  text: string | null | undefined;
  className?: string;
  empty?: string;
}) {
  const display = inboxDisplayText(text, empty ?? '—');
  return (
    <span className={`block min-w-0 cursor-default truncate ${className ?? ''}`} title={display}>
      {display}
    </span>
  );
}

function parseInboxPayload(raw: unknown): InboxRpcPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const total = typeof o.total === 'number' ? o.total : Number(o.total);
  const items = Array.isArray(o.items) ? o.items : [];
  if (!Number.isFinite(total)) return null;
  return { total, items: items as InboxRpcItem[] };
}

function mapRpcRowToDoc(
  row: InboxRpcItem
): Omit<
  ApprovalsDocRow,
  'progressLabel' | 'approverLineNames' | 'recent_reject_comment' | 'hasLineOpinion' | 'linesForStatusPresentation'
> {
  return {
    id: row.id,
    doc_no: row.doc_no,
    title: row.title,
    status: row.status,
    remarks: row.remarks,
    drafted_at: row.drafted_at,
    completed_at: row.completed_at,
    doc_type: row.doc_type,
    writer_id: row.writer_id,
    dept_id: row.dept_id,
    current_line_no: row.current_line_no,
    content: null,
    outbound_requests:
      row.outbound_request_id != null ? { id: Number(row.outbound_request_id) } : null,
    app_users: row.writer_user_name ? { user_name: row.writer_user_name } : null,
    departments: row.dept_name ? { dept_name: row.dept_name } : null,
  };
}

export default function ApprovalsPage() {
  const [docs, setDocs] = useState<ApprovalsDocRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [inboxViewerId, setInboxViewerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);

  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterApproverLine, setFilterApproverLine] = useState('');
  const [filterProgress, setFilterProgress] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDraftDate, setFilterDraftDate] = useState('');

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const setFilterDocNoP = useCallback((v: string) => {
    setFilterDocNo(v);
    setPage(1);
  }, []);
  const setFilterDocTypeP = useCallback((v: string) => {
    setFilterDocType(v);
    setPage(1);
  }, []);
  const setFilterTitleP = useCallback((v: string) => {
    setFilterTitle(v);
    setPage(1);
  }, []);
  const setFilterApproverLineP = useCallback((v: string) => {
    setFilterApproverLine(v);
    setPage(1);
  }, []);
  const setFilterProgressP = useCallback((v: string) => {
    setFilterProgress(v);
    setPage(1);
  }, []);
  const setFilterStatusP = useCallback((v: string) => {
    setFilterStatus(v);
    setPage(1);
  }, []);
  const setFilterDraftDateP = useCallback((v: string) => {
    setFilterDraftDate(v);
    setPage(1);
  }, []);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setInboxViewerId(null);
        setDocs([]);
        setTotalCount(0);
        return;
      }
      setInboxViewerId(user.id);

      const { data: profile } = await supabase
        .from('app_users')
        .select('role_name, can_manage_permissions, can_admin_manage')
        .eq('id', user.id)
        .single();
      setViewerIsAdmin(
        isSystemAdminUser(
          profile as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
        )
      );

      const draftDateRaw = filterDraftDate.trim();
      const pDraftDate =
        draftDateRaw.length >= 8 && /^\d{4}-\d{2}-\d{2}$/.test(draftDateRaw) ? draftDateRaw : null;

      const { data: rawPayload, error } = await supabase.rpc('approval_inbox_query', {
        p_doc_no: filterDocNo.trim() || null,
        p_doc_type: filterDocType.trim() || null,
        p_title: filterTitle.trim() || null,
        p_draft_date: pDraftDate,
        p_approver_line: filterApproverLine.trim() || null,
        p_progress: filterProgress.trim() || null,
        p_status: filterStatus.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });

      if (error) {
        console.error(error.message);
        setFetchError(error.message);
        setDocs([]);
        setTotalCount(0);
        return;
      }

      const payload = parseInboxPayload(rawPayload);
      if (!payload) {
        setFetchError('목록 응답 형식이 올바르지 않습니다.');
        setDocs([]);
        setTotalCount(0);
        return;
      }

      setTotalCount(payload.total);

      const loadedBase = payload.items.map(mapRpcRowToDoc);
      const docIds = loadedBase.map((d) => d.id);

      if (docIds.length === 0) {
        setDocs([]);
        return;
      }

      const [{ data: rejectedRows }, { data: rejectedHistoryRows }, { data: opinionHistoryRowsRaw }, { data: rawLines }] = await Promise.all([
        supabase
          .from('approval_lines')
          .select('approval_doc_id, opinion, acted_at')
          .in('approval_doc_id', docIds)
          .eq('status', 'rejected')
          .not('opinion', 'is', null)
          .order('acted_at', { ascending: false }),
        supabase
          .from('approval_histories')
          .select('approval_doc_id, action_comment, action_at')
          .in('approval_doc_id', docIds)
          .eq('action_type', 'reject')
          .not('action_comment', 'is', null)
          .order('action_at', { ascending: false }),
        supabase
          .from('approval_histories')
          .select('approval_doc_id, action_comment, action_type')
          .in('approval_doc_id', docIds)
          .in('action_type', ['approve', 'reject', 'approve_revoke', 'cancel_request', 'cancel_relay', 'direct_cancel_final'])
          .not('action_comment', 'is', null),
        supabase
          .from('approval_lines')
          .select('approval_doc_id, line_no, status, approver_role, approver_id, opinion')
          .in('approval_doc_id', docIds),
      ]);

      const rejectCommentMap = new Map<number, string>();
      for (const row of (rejectedHistoryRows ?? []) as { approval_doc_id: number; action_comment: string | null }[]) {
        if (!row.approval_doc_id || !row.action_comment) continue;
        if (rejectCommentMap.has(row.approval_doc_id)) continue;
        rejectCommentMap.set(row.approval_doc_id, row.action_comment);
      }
      for (const row of (rejectedRows ?? []) as { approval_doc_id: number; opinion: string | null }[]) {
        if (!row.approval_doc_id || !row.opinion) continue;
        if (rejectCommentMap.has(row.approval_doc_id)) continue;
        rejectCommentMap.set(row.approval_doc_id, row.opinion);
      }

      const opinionHistoryRows = (opinionHistoryRowsRaw ?? []) as {
        approval_doc_id: number;
        action_comment: string | null;
        action_type: string | null;
      }[]
      const lineRows = (rawLines ?? []) as {
        approval_doc_id: number;
        line_no: number;
        status: string;
        approver_role: string;
        approver_id: string;
        opinion?: string | null;
      }[];
      const hasOpinionByDoc = new Map<number, boolean>();
      for (const row of lineRows) {
        if (String(row.opinion ?? '').trim()) {
          hasOpinionByDoc.set(row.approval_doc_id, true);
        }
      }
      for (const row of opinionHistoryRows) {
        const comment = String(row.action_comment ?? '').trim()
        if (!comment || comment === '[-]') continue
        // 시스템성 문구(예: 기안서 상신)는 의견으로 취급하지 않음
        if (comment === '기안서 상신' || comment === '출고요청 상신' || comment === '출고요청 재상신') continue
        if (comment.includes('재상신')) continue
        if (String(row.action_type ?? '').trim() === '') continue
        if (comment) {
          hasOpinionByDoc.set(row.approval_doc_id, true)
        }
      }
      const approverIds = [...new Set(lineRows.map((r) => r.approver_id).filter(Boolean))];
      const nameMap = new Map<string, string>();
      if (approverIds.length > 0) {
        const { data: nameRows } = await supabase.from('app_users').select('id, user_name').in('id', approverIds);
        for (const row of nameRows ?? []) {
          if (row.id) nameMap.set(row.id, row.user_name ?? '');
        }
      }

      const linesByDoc = new Map<number, ApprovalLineWithName[]>();
      for (const row of lineRows) {
        const list = linesByDoc.get(row.approval_doc_id) ?? [];
        list.push({
          line_no: row.line_no,
          status: row.status,
          approver_role: row.approver_role,
          user_name: nameMap.get(row.approver_id) ?? '',
        });
        linesByDoc.set(row.approval_doc_id, list);
      }

      const rpcLineById = new Map(payload.items.map((r) => [r.id, r.approver_line_names]));

      setDocs(
        loadedBase.map((doc) => {
          const lines = linesByDoc.get(doc.id) ?? [];
          const writerLabel = getWriterName(doc.app_users);
          const writerForLine = writerLabel === '-' ? null : writerLabel;
          const rpcRaw = (rpcLineById.get(doc.id) ?? '').trim();
          const rpcApprovers = rpcRaw && rpcRaw !== '-' ? rpcRaw : '';
          const writerSeg = formatInboxApproverLineDisplay(writerForLine, []);
          const approverLineNames =
            lines.length > 0
              ? formatInboxApproverLineDisplay(writerForLine, lines)
              : rpcApprovers
                ? `${writerSeg}-${rpcApprovers}`
                : writerSeg;
          return {
            ...doc,
            recent_reject_comment: rejectCommentMap.get(doc.id) ?? null,
            hasLineOpinion: hasOpinionByDoc.get(doc.id) ?? false,
            linesForStatusPresentation: lines.map((l) => ({
              line_no: l.line_no,
              approver_role: l.approver_role,
              status: l.status,
            })),
            progressLabel: formatApprovalProgressChain(doc as ApprovalsDocRow, lines),
            approverLineNames,
          };
        })
      );
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : e);
      setFetchError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
      setDocs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    filterApproverLine,
    filterDocNo,
    filterDocType,
    filterDraftDate,
    filterProgress,
    filterStatus,
    filterTitle,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  const clearFilters = () => {
    setFilterDocNo('');
    setFilterDocType('');
    setFilterTitle('');
    setFilterApproverLine('');
    setFilterProgress('');
    setFilterStatus('');
    setFilterDraftDate('');
    setPage(1);
  };

  const openDraftPopup = () => {
    openApprovalShellPopup('/approvals/new', 'approvalDraftPopup');
  };

  const openOutboundDraftPopup = () => {
    openApprovalShellPopup('/outbound-requests/new', 'outboundRequestDraftPopup');
  };

  const colCount = 7;
  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalCount);

  const hintOptions = useMemo(() => {
    const uniqStrings = (pick: (d: ApprovalsDocRow) => string) =>
      [...new Set(docs.map((d) => pick(d)).filter(Boolean))].slice(0, 40);
    return {
      docNo: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => String(d.doc_no ?? '').trim())
          .filter(Boolean)
          .map((v) => ({ value: v, label: v })),
      ],
      title: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => String(d.title ?? '').trim())
          .filter(Boolean)
          .map((v) => ({ value: v, label: v.length > 80 ? `${v.slice(0, 80)}…` : v })),
      ],
      line: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => d.approverLineNames)
          .filter((s) => s && s !== '-')
          .map((v) => ({ value: v, label: v })),
      ],
      progress: [
        { value: '', label: '전체' },
        ...uniqStrings((d) => d.progressLabel)
          .filter(Boolean)
          .map((v) => ({ value: v, label: v.length > 100 ? `${v.slice(0, 100)}…` : v })),
      ],
    };
  }, [docs]);

  return (
    <div className="flex w-full min-h-[calc(100dvh-10.5rem)] flex-col space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">통합 결재문서함</h1>
            {viewerIsAdmin ? (
              <span
                className="inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-violet-800"
                title="시스템 관리자 계정으로 조직 전체 문서를 조회 중입니다."
              >
                관리자 · 전체 문서
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-bold text-gray-500">
            {viewerIsAdmin
              ? '관리자는 조직의 모든 결재 문서를 볼 수 있습니다. 일반 사용자는 기안·결재·참조·협조로 지정된 문서만 표시됩니다.'
              : '기안했거나 결재·참조·협조 등 결재선에 포함된 문서만 표시됩니다.'}
          </p>
          <p className="mt-2 text-[11px] font-bold text-gray-400">
            필터·페이지·건수는 서버에서 계산됩니다. 
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void fetchInbox()}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={openDraftPopup}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-white border-2 border-black px-5 text-sm font-black text-black hover:bg-gray-50 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none"
          >
            일반 기안 작성
          </button>
          <button
            type="button"
            onClick={openOutboundDraftPopup}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 border-2 border-black px-5 text-sm font-black text-white hover:bg-blue-700 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none"
          >
            출고 요청 작성
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          목록 조회 오류: {fetchError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold text-gray-500">
        {!loading && (
          <span>
            전체 {totalCount}건 · {rangeStart}-{rangeEnd}번째 표시 · {safePage}/{totalPages} 페이지
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

      <div className="flex flex-1 flex-col rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="min-h-[min(68vh,calc(100dvh-15rem))] overflow-x-auto rounded-t-2xl bg-white">
          <table className="min-w-[960px] w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[11rem]" />
              <col className="w-[6.75rem]" />
              <col />
              <col className="w-[14rem]" />
              <col className="w-[18rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[6.5rem]" />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-gray-50 border-b-2 border-black text-left text-xs font-black uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-4">문서번호</th>
                <th className="whitespace-nowrap px-2 py-4 text-center">유형</th>
                <th className="px-4 py-4">제목</th>
                <th className="px-4 py-4">결재라인</th>
                <th className="px-4 py-4">순번</th>
                <th className="px-3 py-4 text-center">상태</th>
                <th className="px-3 py-4">기안일</th>
              </tr>
              <tr className="border-b border-gray-200 bg-gray-100/80 text-[11px] font-bold normal-case tracking-normal text-gray-600">
                <th className="relative z-30 px-2 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterDocNo}
                    onChange={setFilterDocNoP}
                    options={hintOptions.docNo.length > 1 ? hintOptions.docNo : COMBO_EMPTY}
                    placeholder="문서번호 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-1 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterDocType}
                    onChange={setFilterDocTypeP}
                    options={DOC_TYPE_FILTER_OPTIONS}
                    placeholder="유형"
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="text-[11px] font-bold leading-snug py-1.5 px-1.5"
                    dropdownClassName="min-w-[6.75rem] max-w-[9rem] text-xs"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-2 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterTitle}
                    onChange={setFilterTitleP}
                    options={hintOptions.title.length > 1 ? hintOptions.title : COMBO_EMPTY}
                    placeholder="제목 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-2 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterApproverLine}
                    onChange={setFilterApproverLineP}
                    options={hintOptions.line.length > 1 ? hintOptions.line : COMBO_EMPTY}
                    placeholder="결재자 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-2 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterProgress}
                    onChange={setFilterProgressP}
                    options={hintOptions.progress.length > 1 ? hintOptions.progress : COMBO_EMPTY}
                    placeholder="진행 (비고·결재선)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-1 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterStatus}
                    onChange={setFilterStatusP}
                    options={[...APPROVAL_INBOX_STATUS_FILTER_OPTIONS]}
                    placeholder="상태 (코드·비고)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="text-[11px] font-bold py-1.5 px-1.5"
                    dropdownClassName="min-w-[11rem] text-xs"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-30 px-2 py-2 align-middle font-semibold">
                  <SearchableCombobox
                    value={filterDraftDate}
                    onChange={setFilterDraftDateP}
                    options={COMBO_EMPTY}
                    placeholder="YYYY-MM-DD"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    dropdownPlacement="auto"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-bold text-gray-400"
                  >
                    데이터 로딩 중...
                  </td>
                </tr>
              ) : totalCount === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-bold text-gray-400"
                  >
                    문서가 없습니다.
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-bold text-gray-400"
                  >
                    이 페이지에 표시할 행이 없습니다.
                  </td>
                </tr>
              ) : (
                docs.map((doc) => {
                  const pres = getApprovalDocDetailedStatusPresentation(doc, doc.linesForStatusPresentation);
                  const typeLabel = getDocTypeLabel(doc.doc_type);
                  const draftDate = doc.drafted_at?.slice(0, 10) ?? '';
                  return (
                    <tr key={doc.id} className="group transition-colors hover:bg-gray-50">
                      <td className="px-4 py-4 font-black">
                        <a
                          href={getDocDetailOpenHref(doc, inboxViewerId)}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                            if (e.button !== 0) return;
                            e.preventDefault();
                            openApprovalDocFromInbox(doc, inboxViewerId);
                          }}
                          className="block min-w-0 truncate text-blue-600 hover:underline"
                          title={inboxDisplayText(doc.doc_no)}
                        >
                          {inboxDisplayText(doc.doc_no)}
                        </a>
                      </td>
                      <td className="px-2 py-4 text-center text-xs font-bold text-gray-600">
                        <InboxTruncated text={typeLabel} className="mx-auto max-w-full" />
                      </td>
                      <td className="px-4 py-4 font-black text-gray-800">
                        <div className="min-w-0 space-y-1">
                          <InboxTruncated text={doc.title} className="font-black text-gray-800" />
                          {doc.recent_reject_comment && (
                            <p
                              className="block min-w-0 truncate text-xs font-bold text-red-600"
                              title={`반려 코멘트: ${doc.recent_reject_comment}`}
                            >
                              반려 코멘트: {doc.recent_reject_comment}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-gray-700">
                        <InboxTruncated text={doc.approverLineNames} />
                      </td>
                      <td className="px-4 py-4 text-xs font-bold leading-relaxed text-gray-800">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <InboxTruncated text={doc.progressLabel} />
                          </div>
                          <span
                            aria-label={doc.hasLineOpinion ? '결재·협조 의견 있음' : '결재·협조 의견 없음'}
                            title={
                              doc.hasLineOpinion
                                ? '등록된 결재·협조 의견이 있습니다.'
                                : '등록된 의견이 없습니다.'
                            }
                            className={`shrink-0 select-none rounded-md border px-2 py-0.5 text-[10px] font-black ${
                              doc.hasLineOpinion
                                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-[0_0_0_2px_rgba(59,130,246,0.35)]'
                                : 'border-gray-200 bg-gray-100 text-gray-400 opacity-80'
                            }`}
                          >
                            의견
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-4 text-center">
                        <div
                          className="flex flex-wrap items-center justify-center gap-1"
                          title={pres.badges.map((b) => b.label).join(' · ')}
                        >
                          {pres.badges.map((b, i) => (
                            <span
                              key={i}
                              className={`${b.className} inline-block max-w-full truncate align-middle`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-xs font-bold text-gray-400">
                        <InboxTruncated text={draftDate || null} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && totalCount > 0 ? (
          <div className="flex flex-col gap-3 border-t-2 border-black bg-gray-50 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-700">
              <span className="text-gray-500">페이지당</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                }}
                className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1.5 font-bold text-gray-900"
                aria-label="페이지당 행 수"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}건
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-black">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
              >
                이전
              </button>
              <span className="min-w-[7rem] text-center font-bold text-gray-600">
                {safePage} / {totalPages} 페이지
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
