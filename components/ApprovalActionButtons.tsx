'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  APPROVAL_RECALL_REMARK_MARKER,
  canLastApproverDirectCancelFinalApproval,
  canWriterDeleteApprovalDoc,
  getApprovalDocDetailedStatusPresentation,
  isApprovalCancellationRemarkProcess,
} from '@/lib/approval-status';
import type { ApprovalDocLike, ApprovalLineLike } from '@/lib/approval-status';
import type { Database } from '@/lib/database.types';
import { logApprovalHistory, normalizeOptionalOpinionForHistory } from '@/lib/approval-history-log';
import { getApprovalRoleLabel, isApprovalActionRole } from '@/lib/approval-roles';
import {
  approvalDocumentInboxPath,
  fanoutWorkApprovalNotificationQuiet,
  workApprovalCancelRelayDedupeKey,
  workApprovalCancelRequestDedupeKey,
  workApprovalCancelWriterHandoffDedupeKey,
  workApprovalFinalDedupeKey,
  workApprovalLineTurnDedupeKey,
} from '@/lib/work-approval-notifications';
import { useSingleSubmit } from '@/hooks/useSingleSubmit';

type AppUserRow = Database['public']['Tables']['app_users']['Row'];
type SessionUser = { id: string };
type CurrentUser = AppUserRow | SessionUser;
type ApprovalParticipantLike = {
  user_id: string
  role: string
  line_no: number
}

/** Supabase `PostgrestError` 등 `Error`가 아닌 객체를 alert에 넣지 않도록 */
function formatClientError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim().length > 0) {
      const details = (e as { details?: unknown }).details
      if (typeof details === 'string' && details.trim().length > 0) {
        return `${msg} (${details})`
      }
      return msg
    }
  }
  try {
    return JSON.stringify(e)
  } catch {
    return '알 수 없는 오류입니다.'
  }
}

function throwIfSupabaseError(error: { message?: string } | null | undefined): void {
  if (error == null) return
  const m = typeof error.message === 'string' ? error.message.trim() : ''
  if (m) throw new Error(m)
  throw new Error('요청이 실패했습니다.')
}

/** DB에 `request_approval_cancellation` RPC가 아직 없을 때(PostgREST schema cache) */
function isMissingRequestApprovalCancellationRpc(err: { message?: string } | null | undefined): boolean {
  if (err == null) return false
  const m = String(err.message ?? '').toLowerCase()
  return (
    m.includes('request_approval_cancellation') &&
    (m.includes('could not find the function') || m.includes('schema cache') || m.includes('pgrst202'))
  )
}

function isMissingDirectCancelFinalApprovalRpc(err: { message?: string } | null | undefined): boolean {
  if (err == null) return false
  const m = String(err.message ?? '').toLowerCase()
  return (
    m.includes('direct_cancel_final_approval') &&
    (m.includes('could not find the function') || m.includes('schema cache') || m.includes('pgrst202'))
  )
}

export default function ApprovalActionButtons({
  doc,
  lines,
  participants = [],
}: {
  doc: ApprovalDocLike & { id: number; writer_id?: string | null; doc_type?: string | null; status: string };
  lines: ApprovalLineLike[];
  participants?: ApprovalParticipantLike[];
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { isSubmitting: processing, run: runSingleSubmit } = useSingleSubmit();
  const [opinion, setOpinion] = useState('');
  const [loading, setLoading] = useState(true);
  const [isApprovalAdmin, setIsApprovalAdmin] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('app_users').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile || session.user);
        const { data: adminRpc } = await supabase.rpc('is_approval_admin', { p_uid: session.user.id });
        setIsApprovalAdmin(Boolean(adminRpc));
      } else {
        setIsApprovalAdmin(false);
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="p-4 text-xs font-bold text-gray-400 animate-pulse text-center">권한 확인 중...</div>;
  if (!currentUser || !doc) return null;

  const myId = String(currentUser.id).toLowerCase();
  const isWriter = String(doc?.writer_id || '').toLowerCase() === myId;
  const actorIdForHistory = 'id' in currentUser ? String(currentUser.id) : myId;
  const docTitleForNotify =
    String((doc as { title?: string | null }).title ?? '문서').trim() || '문서';
  const approvalInboxUrl = approvalDocumentInboxPath(doc.id);
  const buildHistoryDedupeKey = (actionType: string, suffix: string) =>
    `doc:${doc.id}:action:${actionType}:actor:${actorIdForHistory}:${suffix}`;

  const sortedLines = [...(lines || [])].sort((a, b) => a.line_no - b.line_no);
  const sortedParticipants = [...participants].sort((a, b) => a.line_no - b.line_no);
  const lineMapByNo = new Map(sortedLines.map((line) => [line.line_no, line]));
  const orderedApprovalFlow =
    sortedParticipants.length > 0
      ? sortedParticipants.map((participant) => {
          const matchedLine = lineMapByNo.get(participant.line_no);
          return {
            id: matchedLine?.id,
            line_no: participant.line_no,
            approver_id: participant.user_id,
            approver_role: participant.role,
            status: matchedLine?.status ?? 'waiting',
            acted_at: (matchedLine as any)?.acted_at ?? null,
          };
        })
      : sortedLines.map((line) => ({
          id: line.id,
          line_no: line.line_no,
          approver_id: line.approver_id,
          approver_role: line.approver_role,
          status: line.status,
          acted_at: (line as any)?.acted_at ?? null,
        }));

  const pendingLine = orderedApprovalFlow.find((l) => l.status === 'pending' && isApprovalActionRole(l.approver_role));
  const lastApprovedLine = [...orderedApprovalFlow].reverse().find(l => l.status === 'approved' || l.status === 'cancelled');
  const minLineNo = orderedApprovalFlow.length ? Math.min(...orderedApprovalFlow.map((l) => l.line_no)) : 1;

  const isCancellationProcess = isApprovalCancellationRemarkProcess(doc.remarks);

  let activeLine = pendingLine;
  if (isCancellationProcess) {
    const cur = doc.current_line_no;
    // 0: 역순 취소가 끝나 기안자만 최종 환원 단계 (결재선 행과 매칭하지 않음)
    if (cur == null || Number(cur) === 0) {
      activeLine = undefined;
    } else {
      activeLine = orderedApprovalFlow.find((l) => l.line_no === cur);
      if (!activeLine) activeLine = lastApprovedLine;
    }
  }

  const isMyTurn = activeLine && String(activeLine.approver_id).toLowerCase() === myId;
  const isAnyLineApproved = orderedApprovalFlow.some(l => l.status === 'approved');

  const updateDoc = async (data: Record<string, unknown>) => {
    const { error } = await supabase.from('approval_docs').update(data).eq('id', doc.id);
    throwIfSupabaseError(error);

    if (doc.doc_type === 'outbound_request' && data.status) {
      await supabase.from('outbound_requests')
        .update({ status: data.status })
        .eq('approval_doc_id', doc.id);
    }
  };

  const normalizeLineUpdatePayload = (data: {
    status: string
    acted_at?: string | null
    opinion?: string | null
  }) => {
    if (!('opinion' in data)) return data
    const o = data.opinion
    const trimmed = o == null ? '' : String(o).trim()
    return { ...data, opinion: trimmed === '' ? null : trimmed }
  }

  const updateActiveLineStatus = async (
    targetLine: { id?: number; line_no: number },
    data: { status: string; acted_at?: string | null; opinion?: string | null }
  ) => {
    const payload = normalizeLineUpdatePayload(data)
    if (targetLine.id) {
      const { data: updated, error } = await supabase
        .from('approval_lines')
        .update(payload)
        .eq('id', targetLine.id)
        .select('id')
      throwIfSupabaseError(error)
      if (updated && updated.length > 0) return
    }
    const { data: fbRows, error: fallbackError } = await supabase
      .from('approval_lines')
      .update(payload)
      .eq('approval_doc_id', doc.id)
      .eq('line_no', targetLine.line_no)
      .select('id')
    throwIfSupabaseError(fallbackError)
    if (!fbRows?.length) {
      throw new Error('결재선 행을 갱신하지 못했습니다. 해당 차수가 없거나 권한이 없습니다.')
    }
  };

  const handleRecall = async () => {
    if (!confirm('기안을 회수하여 임시저장으로 되돌릴까요?')) return;
    await runSingleSubmit(async () => {
      try {
        await updateDoc({ status: 'draft', remarks: APPROVAL_RECALL_REMARK_MARKER, current_line_no: 1 });
        await supabase.from('approval_lines').update({ status: 'waiting', acted_at: null, opinion: null }).eq('approval_doc_id', doc.id);
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: 'recall',
          action_comment: '기안 회수',
          dedupe_key: buildHistoryDedupeKey('recall', `line:${doc.current_line_no ?? 0}`),
        });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'actionable_all_except_actor',
          type: 'work_approval_recalled',
          title: `기안 회수: ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: null,
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });
        alert('회수되었습니다.');
        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  const handleRequestCancel = async () => {
    const reason = prompt('취소 사유를 입력하세요 (필수):');
    if (!reason || reason.length < 2) return alert('사유를 입력해주세요.');
    await runSingleSubmit(async () => {
      try {
        const trimmed = reason.trim()
        const { error } = await supabase.rpc('request_approval_cancellation', {
          p_doc_id: doc.id,
          p_reason: trimmed,
        })
        if (error) {
          if (isWriter && isMissingRequestApprovalCancellationRpc(error)) {
            const lastLineNo = lastApprovedLine ? lastApprovedLine.line_no : orderedApprovalFlow.length
            await updateDoc({
              remarks: '취소 요청 중',
              current_line_no: lastLineNo,
            })
          } else if (isMissingRequestApprovalCancellationRpc(error)) {
            throw new Error(
              '결재자 취소 요청은 DB에 함수 public.request_approval_cancellation 이 필요합니다. supabase db push(또는 마이그레이션 적용) 후 다시 시도하거나 관리자에게 문의하세요.'
            )
          } else {
            throwIfSupabaseError(error)
          }
        }
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: 'cancel_request',
          action_comment: trimmed,
          dedupe_key: buildHistoryDedupeKey(
            'cancel_request',
            `line:${doc.current_line_no ?? 0}:reason:${trimmed}`
          ),
        });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'doc_current_line',
          type: 'work_approval_cancel_requested',
          title: `결재 취소 요청: ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: workApprovalCancelRequestDedupeKey(doc.id),
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });
        alert('결재권자에게 취소 요청이 전달되었습니다.');
        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  const handleDirectFinalCancel = async () => {
    if (
      !confirm(
        '최종 승인을 취소하고 기안자에게 문서를 되돌립니다. 기안자는 반려와 같이 수정·재상신할 수 있습니다. 계속하시겠습니까?'
      )
    ) {
      return;
    }
    const opinionInput = prompt('결재 취소 의견 (선택, 비우면 생략):');
    if (opinionInput === null) return;
    await runSingleSubmit(async () => {
      try {
        // 렌더 시점 이후 상태가 바뀔 수 있으므로 클릭 시점 DB 상태를 다시 검증한다.
        const { data: latestDoc, error: latestDocError } = await supabase
          .from('approval_docs')
          .select('status, remarks')
          .eq('id', doc.id)
          .single();
        throwIfSupabaseError(latestDocError);
        const latestStatus = String(latestDoc?.status ?? '');
        const latestRemarks = String(latestDoc?.remarks ?? '');
        if (latestStatus !== 'approved') {
          const statusLabel = latestStatus || 'unknown';
          alert(
            `직접 결재취소는 최종승인 문서에서만 가능합니다. 현재 상태: ${statusLabel}\n` +
              '문서 새로고침 후 "결재 취소 승인 요청" 흐름으로 진행해 주세요.'
          );
          return;
        }
        if (
          latestRemarks.includes('취소 요청') ||
          latestRemarks.includes('취소완료') ||
          latestRemarks.includes('취소승인')
        ) {
          alert('이미 취소 프로세스가 진행 중입니다. 화면을 새로고침해 최신 상태를 확인해 주세요.');
          return;
        }

        const { error } = await supabase.rpc('direct_cancel_final_approval', {
          p_doc_id: doc.id,
          p_opinion: opinionInput.trim(),
        });
        if (error) {
          if (isMissingDirectCancelFinalApprovalRpc(error)) {
            throw new Error(
              'DB에 함수 public.direct_cancel_final_approval 이 필요합니다. supabase db push(또는 마이그레이션 적용) 후 다시 시도하세요.'
            );
          }
          throwIfSupabaseError(error);
        }
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: 'direct_cancel_final',
          action_comment: normalizeOptionalOpinionForHistory(opinionInput.trim()),
          dedupe_key: buildHistoryDedupeKey('direct_cancel_final', 'final'),
        });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'writer',
          type: 'work_approval_direct_cancel',
          title: `결재 취소(최종승인): ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: null,
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });
        alert('결재가 취소되었습니다.');
        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  // 🌟 [핵심 로직 수정] 취소 릴레이 로직 완벽 교정
  const handleApproveCancellation = async () => {
    if (!activeLine) return;
    if (!opinion.trim()) return alert('취소 승인 의견을 아래 칸에 필수로 입력해주세요.');

    await runSingleSubmit(async () => {
      try {
        // 문서 자체가 아직 승인되지 않고 '진행 중'일 때 취소하는 경우 (일반 반려와 동일하게 처리)
        if (doc.status !== 'approved' && !doc.remarks?.includes('취소완료')) {
          await updateActiveLineStatus(activeLine, { status: 'rejected', acted_at: new Date().toISOString(), opinion });
          await updateDoc({ status: 'rejected', remarks: '결재 중 취소됨' });
          await logApprovalHistory(supabase, {
            approval_doc_id: doc.id,
            actor_id: actorIdForHistory,
            action_type: 'reject',
            action_comment: opinion.trim(),
            dedupe_key: buildHistoryDedupeKey('reject', `line:${activeLine.line_no}`),
          });
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'writer',
            type: 'work_approval_cancel_request_rejected',
            title: `결재 취소 요청 반려: ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: null,
            payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
          });
          alert('문서가 종료되었습니다.');
          router.push('/approvals');
          return;
        }

        // 이미 '최종 승인'된 문서를 역순으로 취소 릴레이 하는 경우
        const roleName = getApprovalRoleLabel(activeLine.approver_role);
        const now = new Date().toISOString();

        // 현재 내 결재선 상태를 'cancelled'(취소됨)으로 업데이트
        await updateActiveLineStatus(activeLine, { status: 'cancelled', acted_at: now, opinion });

        // 역순: 큰 line_no → … → 가장 작은 line_no 다음은 기안자 최종 환원 (검토자 없이 결재자만 있어도 동일)
        if (activeLine.line_no <= minLineNo) {
          await updateDoc({ current_line_no: 0, remarks: `${roleName} 취소승인` });
          await logApprovalHistory(supabase, {
            approval_doc_id: doc.id,
            actor_id: actorIdForHistory,
            action_type: 'cancel_relay',
            action_comment: `${roleName} 취소승인 · ${opinion.trim()}`,
            dedupe_key: buildHistoryDedupeKey('cancel_relay', `line:${activeLine.line_no}:writer-handoff`),
          });
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'writer',
            type: 'work_approval_cancel_writer_handoff',
            title: `결재 취소: 기안자 최종 확인 — ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: workApprovalCancelWriterHandoffDedupeKey(doc.id),
            payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
          });
          alert('취소가 승인되어 기안자에게 최종 환원 권한이 넘어갔습니다.');
        } else {
          const nextLineNo = activeLine.line_no - 1;
          await updateDoc({ current_line_no: nextLineNo, remarks: `${roleName} 취소완료` });
          await logApprovalHistory(supabase, {
            approval_doc_id: doc.id,
            actor_id: actorIdForHistory,
            action_type: 'cancel_relay',
            action_comment: `${roleName} 취소완료(다음 차수로) · ${opinion.trim()}`,
            dedupe_key: buildHistoryDedupeKey('cancel_relay', `line:${activeLine.line_no}:next`),
          });
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'doc_current_line',
            type: 'work_approval_cancel_relay_turn',
            title: `결재 취소 검토 차례: ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: workApprovalCancelRelayDedupeKey(doc.id, nextLineNo),
            payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null, line_no: nextLineNo },
          });
          alert('하위 결재자에게 취소 검토를 넘겼습니다.');
        }
        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  const handleFinalizeCancel = async () => {
    if (!confirm('최종 취소 처리와 함께 재고를 환원하시겠습니까?')) return;
    await runSingleSubmit(async () => {
      try {
        const { error: rpcError } = await supabase.rpc('finalize_outbound_cancellation', { p_doc_id: doc.id });
        if (rpcError) throw new Error(`[재고환원 에러] ${rpcError.message}`);

        await updateDoc({ 
          status: 'rejected', 
          remarks: '취소 완료(재고환원)',
          completed_at: new Date().toISOString() 
        });
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: 'outbound_cancel_done',
          action_comment: '취소 완료(재고환원)',
          dedupe_key: buildHistoryDedupeKey('outbound_cancel_done', 'final'),
        });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'actionable_all_except_actor',
          type: 'work_approval_outbound_cancel_done',
          title: `취소 완료(재고환원): ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: null,
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });

        alert('✅ 취소 승인 및 재고 환원이 모두 완료되었습니다!');
        router.push('/approvals');
      } catch (e: unknown) {
        console.error(e);
        alert('처리 중 오류 발생: ' + formatClientError(e));
      }
    });
  };

  const handleGeneralAction = async (type: 'approved' | 'rejected') => {
    if (!activeLine) return;
    if (type === 'rejected' && !opinion) return alert('반려 사유를 입력하세요.');
    
    await runSingleSubmit(async () => {
      try {
        const now = new Date().toISOString();
        await updateActiveLineStatus(activeLine, { status: type, acted_at: now, opinion });

        let nextLineNoForNotify: number | null = null;
        let isFinalApproval = false;

        if (type === 'rejected') {
          await updateDoc({ status: 'rejected', remarks: '결재자 반려' });
        } else {
          const nextLine = orderedApprovalFlow.find(
            (line) =>
              line.line_no > activeLine.line_no &&
              line.status === 'waiting' &&
              isApprovalActionRole(line.approver_role)
          );
          const isLast = !nextLine;
          if (isLast) {
            isFinalApproval = true;
            await updateDoc({ status: 'approved', completed_at: now });
          } else {
            nextLineNoForNotify = nextLine.line_no;
            await updateActiveLineStatus(nextLine, { status: 'pending' });
            await updateDoc({ current_line_no: nextLine.line_no, status: 'in_review' });
          }
        }
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: type === 'approved' ? 'approve' : 'reject',
          action_comment:
            type === 'approved' ? normalizeOptionalOpinionForHistory(opinion) : opinion.trim(),
          dedupe_key: buildHistoryDedupeKey(
            type === 'approved' ? 'approve' : 'reject',
            `line:${activeLine.line_no}`
          ),
        });

        if (type === 'rejected') {
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'writer',
            type: 'work_approval_rejected',
            title: `결재 반려: ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: null,
            payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
          });
        } else if (isFinalApproval) {
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'writer',
            type: 'work_approval_completed',
            title: `결재 완료: ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: workApprovalFinalDedupeKey(doc.id),
            payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
          });
        } else if (nextLineNoForNotify != null) {
          fanoutWorkApprovalNotificationQuiet(supabase, {
            actorId: actorIdForHistory,
            approvalDocId: doc.id,
            recipientMode: 'pending_lines',
            type: 'work_approval_line_turn',
            title: `결재 대기: ${docTitleForNotify}`,
            targetUrl: approvalInboxUrl,
            dedupeKey: workApprovalLineTurnDedupeKey(doc.id, nextLineNoForNotify),
            payload: { approval_doc_id: doc.id, activated_line_no: nextLineNoForNotify },
          });
        }

        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  // 🌟 UI 렌더링 조건 수정
  const isCancellationRelay = isCancellationProcess && !doc?.remarks?.includes('재고환원');

  /** 승인 철회: 본인 차수는 승인됐고, 그 다음 결재·협조·참조 차수는 아직 대기/검토 전인 경우에만 허용 */
  const flowSorted = [...orderedApprovalFlow].sort((a, b) => a.line_no - b.line_no);
  const revokableApprovalLine = (() => {
    if (isCancellationProcess) return undefined;
    if (doc.status === 'rejected' || doc.status === 'draft') return undefined;
    if (!['submitted', 'in_review', 'approved'].includes(doc.status)) return undefined;
    for (let i = flowSorted.length - 1; i >= 0; i -= 1) {
      const row = flowSorted[i];
      if (String(row.approver_id).toLowerCase() !== myId) continue;
      if (row.status !== 'approved') continue;
      if (!isApprovalActionRole(row.approver_role)) continue;
      const nextAction = flowSorted.find(
        (l) => l.line_no > row.line_no && isApprovalActionRole(l.approver_role)
      );
      if (!nextAction) continue;
      if (String(nextAction.approver_id).toLowerCase() === myId) continue;
      if (nextAction.status !== 'pending' && nextAction.status !== 'waiting') continue;
      return row;
    }
    return undefined;
  })();

  /** 기안자와 동일한 결재 취소(역순 릴레이) 발의: 최종 승인 후이거나, 진행 중 본인 차수는 이미 승인한 결재·협조·참조자 */
  const participatesInActionFlow = orderedApprovalFlow.some(
    (l) => String(l.approver_id).toLowerCase() === myId && isApprovalActionRole(l.approver_role)
  );
  const hasSelfApprovedLine = orderedApprovalFlow.some(
    (l) =>
      String(l.approver_id).toLowerCase() === myId &&
      l.status === 'approved' &&
      isApprovalActionRole(l.approver_role)
  );
  const canApproverRequestCancel =
    !isWriter &&
    participatesInActionFlow &&
    !isCancellationProcess &&
    doc.status !== 'rejected' &&
    ['submitted', 'in_review', 'approved'].includes(doc.status) &&
    (doc.status === 'approved' || hasSelfApprovedLine);

  const canDirectFinalCancel = canLastApproverDirectCancelFinalApproval({
    doc,
    orderedFlow: orderedApprovalFlow,
    currentUserId: myId,
  });

  const canShowCancelRequestButton =
    !isCancellationProcess &&
    doc.status !== 'rejected' &&
    (doc.status === 'approved' || isAnyLineApproved) &&
    (isWriter || canApproverRequestCancel) &&
    !canDirectFinalCancel;

  const handleAdminDeleteDocument = async () => {
    if (!isApprovalAdmin) return;
    const statusLabel =
      getApprovalDocDetailedStatusPresentation(doc, lines).badges[0]?.label ?? String(doc.status ?? '');
    if (!confirm(`현재 상태: ${statusLabel}입니다. 그래도 삭제하시겠습니까?`)) return;
    await runSingleSubmit(async () => {
      try {
        const { error } = await supabase.rpc('admin_delete_approval_doc', { p_doc_id: doc.id });
        throwIfSupabaseError(error);
        const listHref = doc.doc_type === 'outbound_request' ? '/outbound-requests' : '/approvals';
        try {
          if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
            window.opener.location.reload();
          }
        } catch {
          /* ignore cross-origin */
        }
        router.push(listHref);
        router.refresh();
      } catch (e: unknown) {
        alert('관리자 삭제 오류: ' + formatClientError(e));
      }
    });
  };

  const handleWriterDeleteDocument = async () => {
    if (!canWriterDeleteApprovalDoc(doc)) return;
    if (
      !confirm(
        '이 문서를 완전히 삭제합니다. 연결된 출고 요청·결재선·이력도 함께 삭제되며 복구할 수 없습니다. 계속하시겠습니까?'
      )
    ) {
      return;
    }
    await runSingleSubmit(async () => {
      try {
        const { error } = await supabase.from('approval_docs').delete().eq('id', doc.id);
        throwIfSupabaseError(error);
        const listHref = doc.doc_type === 'outbound_request' ? '/outbound-requests' : '/approvals';
        try {
          if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
            window.opener.location.reload();
          }
        } catch {
          /* ignore cross-origin */
        }
        router.push(listHref);
        router.refresh();
      } catch (e: unknown) {
        alert('삭제 오류: ' + formatClientError(e));
      }
    });
  };

  const handleApproveRevoke = async () => {
    if (!revokableApprovalLine) return;
    if (!opinion.trim()) return alert('승인 철회 사유를 입력해주세요.');
    if (!confirm('승인을 철회하면 문서가 반려와 동일하게 종료되며, 기안자가 수정·재상신할 수 있습니다. 계속하시겠습니까?')) return;
    await runSingleSubmit(async () => {
      try {
        const now = new Date().toISOString();
        await updateActiveLineStatus(revokableApprovalLine, {
          status: 'rejected',
          acted_at: now,
          opinion: opinion.trim(),
        });
        await updateDoc({
          status: 'rejected',
          remarks: '승인 철회',
        });
        await logApprovalHistory(supabase, {
          approval_doc_id: doc.id,
          actor_id: actorIdForHistory,
          action_type: 'approve_revoke',
          action_comment: opinion.trim(),
          action_at: now,
          dedupe_key: buildHistoryDedupeKey('approve_revoke', `line:${revokableApprovalLine.line_no}`),
        });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'writer',
          type: 'work_approval_approve_revoke',
          title: `승인 철회: ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: null,
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });
        alert('승인이 철회되었습니다.');
        window.location.reload();
      } catch (e: unknown) {
        alert('오류: ' + formatClientError(e));
      }
    });
  };

  const handleAdminForceCancel = async () => {
    if (!confirm('관리자 권한으로 강제 취소 및 재고를 환원하시겠습니까?')) return;
    await runSingleSubmit(async () => {
      try {
        await supabase.rpc('finalize_outbound_cancellation', { p_doc_id: doc.id });
        await updateDoc({ status: 'rejected', remarks: '관리자 강제취소(재고환원)' });
        fanoutWorkApprovalNotificationQuiet(supabase, {
          actorId: actorIdForHistory,
          approvalDocId: doc.id,
          recipientMode: 'writer',
          type: 'work_approval_admin_force_cancel',
          title: `관리자 강제 취소(재고환원): ${docTitleForNotify}`,
          targetUrl: approvalInboxUrl,
          dedupeKey: null,
          payload: { approval_doc_id: doc.id, doc_type: doc.doc_type ?? null },
        });
        alert('강제 취소 및 환원이 완료되었습니다.');
        window.location.reload();
      } catch (e: unknown) {
        alert('관리자 취소 오류: ' + formatClientError(e));
      }
    });
  }

  return (
    <div className="bg-white border-2 border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      {isApprovalAdmin && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleAdminDeleteDocument}
            disabled={processing}
            className="w-full border-2 border-red-900 bg-red-950 py-2 rounded-xl font-bold text-[10px] text-red-100 opacity-90 hover:opacity-100 transition-all uppercase"
          >
            관리자 문서 삭제
          </button>
          <button
            type="button"
            onClick={handleAdminForceCancel}
            disabled={processing}
            className="w-full border-2 border-gray-900 text-gray-900 py-2 rounded-xl font-bold text-[10px] opacity-30 hover:opacity-100 transition-all uppercase"
          >
            Admin Force Cancel & Revert Stock
          </button>
        </div>
      )}

      {isWriter && (
        <div className="space-y-2">
          {canWriterDeleteApprovalDoc(doc) && (
            <button
              type="button"
              onClick={handleWriterDeleteDocument}
              disabled={processing}
              className="w-full rounded-2xl border-2 border-red-700 bg-red-50 py-3 text-sm font-black text-red-800 hover:bg-red-100"
            >
              문서 삭제
            </button>
          )}
          {doc.status === 'submitted' && !isAnyLineApproved && (
            <button onClick={handleRecall} disabled={processing} className="erp-btn-recall w-full py-4 rounded-2xl font-black text-sm bg-orange-500 text-white">기안 회수 (임시저장)</button>
          )}
          {(doc.remarks?.includes('취소완료') && !doc.remarks?.includes('재고환원')) && (
            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
               <p className="text-xs text-orange-600 font-bold text-center animate-pulse">상위 결재자들의 역순 취소가 진행 중입니다.</p>
            </div>
          )}
          {doc.remarks?.includes('취소승인') && (
            <button onClick={handleFinalizeCancel} disabled={processing} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black text-lg animate-bounce shadow-xl border-b-4 border-red-800">최종 취소 및 재고환원</button>
          )}
        </div>
      )}

      {canDirectFinalCancel && (
        <button
          type="button"
          onClick={handleDirectFinalCancel}
          disabled={processing}
          className="w-full border-2 border-red-700 bg-red-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-red-700 transition-colors shadow-md"
        >
          결재취소
        </button>
      )}

      {canShowCancelRequestButton && (
        <button
          type="button"
          onClick={handleRequestCancel}
          disabled={processing}
          className="w-full border-2 border-red-500 text-red-500 py-4 rounded-2xl font-black text-sm hover:bg-red-50 transition-colors"
        >
          결재 취소 승인 요청
        </button>
      )}

      {revokableApprovalLine && !isMyTurn && (
        <div className="pt-2 border-t border-amber-100 space-y-3">
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4 space-y-3">
            <p className="text-center text-[11px] font-black text-amber-900">
              이전 차수에서 승인한 내역을 철회할 수 있습니다. 다음 결재자가 아직 처리하지 않은 경우에만 가능합니다.
            </p>
            <textarea
              className="w-full bg-white border border-amber-200 rounded-2xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="승인 철회 사유 (필수)"
              value={opinion}
              onChange={(e) => setOpinion(e.target.value)}
              rows={2}
            />
            <button
              type="button"
              onClick={handleApproveRevoke}
              disabled={processing}
              className="w-full border-2 border-amber-700 bg-amber-100 text-amber-950 py-3 rounded-2xl font-black text-sm hover:bg-amber-200 transition-colors"
            >
              승인 철회
            </button>
          </div>
        </div>
      )}

      {isMyTurn && (
        <div className="pt-2 border-t border-gray-50 space-y-3">
          {isCancellationRelay ? (
            <div className="bg-red-600 p-5 rounded-3xl shadow-xl">
               <p className="text-white text-center text-xs font-black mb-3 animate-pulse">
                 {doc.remarks === '취소 요청 중' ? '⚠️ 결재 취소 요청이 접수되었습니다.' : `⚠️ 역순 취소 릴레이 (${doc.remarks})`}
               </p>
               <textarea className="w-full bg-white text-gray-900 border-0 rounded-xl p-3 text-sm font-bold outline-none mb-3" placeholder="취소 승인 의견을 입력하세요 (필수)" value={opinion} onChange={e => setOpinion(e.target.value)} rows={2} />
               <button onClick={handleApproveCancellation} disabled={processing} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-sm hover:bg-black transition-colors shadow-lg">취소 요청 승인</button>
            </div>
          ) : (
            doc.status !== 'approved' && doc.status !== 'rejected' && (
              <>
                <textarea className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="결재 의견을 입력하세요" value={opinion} onChange={e => setOpinion(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <button onClick={() => handleGeneralAction('approved')} disabled={processing} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition-colors shadow-md">승인</button>
                  <button onClick={() => handleGeneralAction('rejected')} disabled={processing} className="flex-1 bg-red-100 text-red-600 py-4 rounded-2xl font-black text-sm hover:bg-red-200 transition-colors shadow-sm">반려</button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}