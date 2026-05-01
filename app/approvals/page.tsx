'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import TableFilterCombobox from '@/components/TableFilterCombobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import InlineAlertMirror from '@/components/InlineAlertMirror'
import ApprovalPageLayout from '@/components/approvals/ApprovalPageLayout'
import ApprovalInboxTableRow from '@/components/approvals/ApprovalInboxTableRow'
import {
  getApprovalDocTypeRule,
  getApprovalDocTypeLabel,
  getApprovalInboxDocTypeFilterOptions,
  getApprovalComposePopupWindowName,
} from '@/lib/approval-doc-type-rules'
import { openApprovalShellPopup } from '@/lib/approval-popup'
import {
  APPROVAL_INBOX_STATUS_FILTER_OPTIONS,
  formatApprovalProgressChain,
  formatInboxApproverLineDisplay,
  getApprovalDocDetailedStatusPresentation,
  getDocDetailOpenHref,
  getWriterName,
} from '@/lib/approval-status'
import type { ApprovalDocLike, ApprovalLineWithName } from '@/lib/approval-status'
import { isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import {
  type InboxRpcItem,
  parseApprovalInboxRpcPayload,
} from '@/lib/approval-inbox-rpc'

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

const DOC_TYPE_FILTER_OPTIONS = getApprovalInboxDocTypeFilterOptions();
const GENERAL_DOC_TYPE_FILTER_OPTIONS = DOC_TYPE_FILTER_OPTIONS.filter(
  (option) => option.value === '' || option.value !== 'outbound_request'
).map((option) =>
  option.value === '' ? { value: '', label: '전체' } : option
);
const DEFAULT_GENERAL_DOC_TYPE_CSV = GENERAL_DOC_TYPE_FILTER_OPTIONS
  .map((option) => option.value)
  .filter(Boolean)
  .join(',');
const GENERAL_DRAFT_COMPOSE_HREF = getApprovalDocTypeRule('draft_doc')?.composeHref ?? '/approvals/new';
const GENERAL_DRAFT_COMPOSE_WINDOW_NAME = getApprovalComposePopupWindowName('draft_doc');

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const COMBO_EMPTY = [{ value: '', label: '전체' }];

function inboxDisplayText(value: string | null | undefined, empty = '—') {
  const s = value == null ? '' : String(value).trim();
  return s || empty;
}

function mapRpcRowToDoc(
  row: InboxRpcItem
): Omit<
  ApprovalsDocRow,
  'progressLabel' | 'approverLineNames' | 'recent_reject_comment' | 'hasLineOpinion' | 'linesForStatusPresentation'
> {
  const rule = getApprovalDocTypeRule(row.doc_type);
  /**
   * RPC에서 `outbound_request_id`를 못 받은 경우:
   * - 출고요청 문서라도 상세 URL 계산은 Rule에서 결재문서 view 폴백을 사용한다.
   * - 값이 있으면 기존처럼 `/outbound-requests/view/{id}`로 연결된다.
   */
  const outboundRef =
    row.outbound_request_id != null ? { id: Number(row.outbound_request_id) } : null;

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
      rule?.docType === 'outbound_request' && outboundRef == null ? null : outboundRef,
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
  const [expandedApproverLineDocId, setExpandedApproverLineDocId] = useState<number | null>(null);

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

      const selectedDocType = filterDocType.trim();
      const pDocType = selectedDocType || DEFAULT_GENERAL_DOC_TYPE_CSV || null;

      const { data: rawPayload, error } = await supabase.rpc('approval_inbox_query', {
        p_doc_no: filterDocNo.trim() || null,
        p_doc_type: pDocType,
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

      const payload = parseApprovalInboxRpcPayload(rawPayload);
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

  const handleRefresh = useCallback(() => {
    clearFilters();
    setPage(1);
    void fetchInbox();
  }, [fetchInbox]);

  const openDraftPopup = () => {
    openApprovalShellPopup(GENERAL_DRAFT_COMPOSE_HREF, GENERAL_DRAFT_COMPOSE_WINDOW_NAME);
  };

  const colCount = 7;
  const visibleDocs = useMemo(() => docs, [docs]);
  const visibleCount = visibleDocs.length;
  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalCount);

  const hintOptions = useMemo(() => {
    const uniqStrings = (pick: (d: ApprovalsDocRow) => string) =>
      [...new Set(visibleDocs.map((d) => pick(d)).filter(Boolean))].slice(0, 40);
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
  }, [visibleDocs]);

  const stripDraftCompletePrefix = useCallback((progress: string) => {
    return progress
      .replace(/기안완료(?:\s*[>,/|·]\s*|\s*)/gu, '')
      // 다양한 구분 기호(>, 전각>, 화살표류, 불릿)를 표시에서 제거
      .replace(/[>＞›»→▶▸•·]/g, ' ')
      .replace(/^[>,/|·\s]+/u, '')
      .replace(/^-\s*/u, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);

  const getPendingActorNames = useCallback((progress: string) => {
    const cleaned = stripDraftCompletePrefix(progress);
    const names: string[] = [];
    const regex = /([^\s]+?)(?:결재대기중|협조대기중|대기중|결재중|협조중)/g;
    let m: RegExpExecArray | null = null;
    while ((m = regex.exec(cleaned)) !== null) {
      const name = String(m[1] ?? '').trim();
      if (name) names.push(name);
    }
    return [...new Set(names)];
  }, [stripDraftCompletePrefix]);

  const getCollapsedApproverLineText = useCallback((line: string, pendingName?: string | null) => {
    const value = line.trim();
    if (!value) return '-';
    if (pendingName) {
      const parts = value.split('-').map((p) => p.trim()).filter(Boolean);
      const first = parts[0] ?? pendingName;
      if (parts.length >= 2) return `${first}-${pendingName}...`;
      return `${pendingName}...`;
    }
    const parts = value.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}-...`;
    if (value.length <= 8) return value;
    return `${value.slice(0, 8)}...`;
  }, []);

  const keepOnlyActiveProgress = useCallback((progress: string) => {
    const noDraft = stripDraftCompletePrefix(progress);
    const activeOnly = noDraft
      .replace(/[^\s]+(?:결재완료|협조완료)\s*/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return activeOnly || noDraft;
  }, [stripDraftCompletePrefix]);

  const renderApproverLineWithPendingHighlight = useCallback((line: string, pendingNames: string[]) => {
    if (!pendingNames.length) return line;
    const unique = [...new Set(pendingNames.filter(Boolean))];
    if (!unique.length) return line;
    const escaped = unique.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = line.split(pattern);
    return parts.map((part, idx) =>
      unique.includes(part) ? (
        <span key={`${part}-${idx}`} className="font-semibold text-blue-600">
          {part}
        </span>
      ) : (
        <span key={`text-${idx}`}>{part}</span>
      )
    );
  }, []);

  return (
    <ApprovalPageLayout
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          일반기안문서함
          {viewerIsAdmin ? (
            <Badge
              variant="outline"
              className="border-violet-300 bg-violet-50 text-[11px] font-semibold uppercase tracking-wide text-violet-800"
              title="시스템 관리자 계정으로 조직 전체 문서를 조회 중입니다."
            >
              관리자 · 전체 문서
            </Badge>
          ) : null}
        </span>
      }
      description={
        <>
          <span>
            {viewerIsAdmin
              ? '관리자는 일반기안 문서를 조직 전체 기준으로 조회할 수 있습니다.'
              : '일반기안 중 기안했거나 결재·참조·협조 결재선에 포함된 문서가 표시됩니다.'}
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            필터·페이지·건수는 서버에서 계산됩니다.
          </span>
        </>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={openDraftPopup}>
            일반 기안 작성
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleRefresh}>
            새로고침
          </Button>
        </div>
      }
    >
      {fetchError ? <InlineAlertMirror message={fetchError} variant="error" /> : null}

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground md:text-sm">
              {!loading ? (
                <span>
                  전체 <span className="font-semibold text-foreground">{totalCount}</span>건 · {rangeStart}-{rangeEnd}
                  번째 표시 · 일반기안 표시 <span className="font-semibold text-foreground">{visibleCount}</span>건 · {safePage}/{totalPages} 페이지
                </span>
              ) : (
                <span>불러오는 중…</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              title="필터 초기화"
              aria-label="필터 초기화"
              onClick={clearFilters}
            >
              <FilterX className="size-3.5" aria-hidden />
            </Button>
          </div>

          <div className="flex min-h-[min(60vh,32rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1160px] table-fixed border-collapse text-left text-sm text-card-foreground">
                <colgroup>
                  <col className="w-[11rem]" />
                  <col className="w-[5.5rem]" />
                  <col className="w-[20rem]" />
                  <col className="w-[8.75rem]" />
                  <col className="w-[10.5rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[6.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">문서번호</span>
                    </th>
                    <th className="whitespace-nowrap px-2 py-3 text-center md:px-3">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">유형</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">제목</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">결재라인</span>
                    </th>
                    <th className="px-3 py-3 md:px-4">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">순번</span>
                    </th>
                    <th className="px-2 py-3 text-center md:px-3">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">상태</span>
                    </th>
                    <th className="px-2 py-3 md:px-3">
                      <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-muted-foreground">기안일</span>
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                <th className="relative z-[2] px-2 py-2 align-top">
                  <TableFilterCombobox
                    value={filterDocNo}
                    onChange={setFilterDocNoP}
                    options={hintOptions.docNo.length > 1 ? hintOptions.docNo : COMBO_EMPTY}
                    placeholder="문서번호 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-1 py-2 align-top">
                  <TableFilterCombobox
                    value={filterDocType}
                    onChange={setFilterDocTypeP}
                    options={GENERAL_DOC_TYPE_FILTER_OPTIONS}
                    placeholder="유형"
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 text-[11px] font-bold leading-snug py-1.5 px-1.5"
                    dropdownClassName="min-w-[5rem] max-w-[7rem] text-xs"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-2 py-2 align-top">
                  <TableFilterCombobox
                    value={filterTitle}
                    onChange={setFilterTitleP}
                    options={hintOptions.title.length > 1 ? hintOptions.title : COMBO_EMPTY}
                    placeholder="제목 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-2 py-2 align-top">
                  <TableFilterCombobox
                    value={filterApproverLine}
                    onChange={setFilterApproverLineP}
                    options={hintOptions.line.length > 1 ? hintOptions.line : COMBO_EMPTY}
                    placeholder="결재자 (서버 검색)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-2 py-2 align-top">
                  <TableFilterCombobox
                    value={filterProgress}
                    onChange={setFilterProgressP}
                    options={hintOptions.progress.length > 1 ? hintOptions.progress : COMBO_EMPTY}
                    placeholder="진행 (비고·결재선)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-1 py-2 align-top">
                  <TableFilterCombobox
                    value={filterStatus}
                    onChange={setFilterStatusP}
                    options={[...APPROVAL_INBOX_STATUS_FILTER_OPTIONS]}
                    placeholder="상태 (코드·비고)"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 text-[11px] font-bold py-1.5 px-1.5"
                    dropdownClassName="min-w-[9rem] text-xs"
                    dropdownPlacement="auto"
                  />
                </th>
                <th className="relative z-[2] px-2 py-2 align-top">
                  <TableFilterCombobox
                    value={filterDraftDate}
                    onChange={setFilterDraftDateP}
                    options={COMBO_EMPTY}
                    placeholder="YYYY-MM-DD"
                    creatable
                    showClearOption={false}
                    listMaxHeightClass="max-h-56 overflow-y-auto"
                    buttonClassName="w-full min-w-0 whitespace-nowrap text-[11px] font-semibold"
                    dropdownPlacement="auto"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-medium text-muted-foreground"
                  >
                    데이터 로딩 중…
                  </td>
                </tr>
              ) : totalCount === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-medium text-muted-foreground"
                  >
                    문서가 없습니다.
                  </td>
                </tr>
              ) : visibleDocs.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="min-h-[48vh] align-middle p-12 text-center text-sm font-medium text-muted-foreground"
                  >
                    이 페이지에 표시할 행이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleDocs.map((doc) => {
                  const pres = getApprovalDocDetailedStatusPresentation(doc, doc.linesForStatusPresentation);
                  const typeLabel = getApprovalDocTypeLabel(doc.doc_type);
                  const draftDate = doc.drafted_at?.slice(0, 10) ?? '';
                  const pendingNames = getPendingActorNames(doc.progressLabel);
                  const collapsedLine = getCollapsedApproverLineText(doc.approverLineNames);
                  const activeProgress = keepOnlyActiveProgress(doc.progressLabel);
                  return (
                    <ApprovalInboxTableRow
                      key={doc.id}
                      doc={doc}
                      inboxViewerId={inboxViewerId}
                      typeLabel={typeLabel}
                      draftDate={draftDate}
                      collapsedLine={collapsedLine}
                      activeProgress={activeProgress}
                      pendingNames={pendingNames}
                      statusBadges={pres.badges}
                      expanded={expandedApproverLineDocId === doc.id}
                      onToggleExpanded={(docId) =>
                        setExpandedApproverLineDocId((prev) => (prev === docId ? null : docId))
                      }
                      renderApproverLineWithPendingHighlight={renderApproverLineWithPendingHighlight}
                    />
                  );
                })
              )}
            </tbody>
          </table>
            </div>
          </div>

          {!loading && totalCount > 0 ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
                <span>페이지당</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="페이지당 행 수"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}건
                    </option>
                  ))}
                </select>
                <span>
                  · 전체 <span className="font-semibold text-foreground">{totalCount}</span>건 ·{' '}
                  <span className="font-semibold text-foreground">{safePage}</span> / {totalPages} 페이지
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  다음
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </ApprovalPageLayout>
  );
}
