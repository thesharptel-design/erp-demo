'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type ApprovalLine = {
  id: number;
  approval_doc_id: number;
  line_no: number;
  approver_id: string;
  approver_role: string;
  status: string;
  acted_at?: string | null;
  opinion?: string | null;
};

export default function ApprovalActionButtons({ docId, docNo, lines }: { docId: number, docNo: string, lines: ApprovalLine[] }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [opinion, setOpinion] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);
    };
    fetchUser();
  }, []);

  if (!currentUser) return <div className="text-sm text-gray-500">사용자 확인 중...</div>;

  const currentTurnLine = [...lines]
    .sort((a, b) => a.line_no - b.line_no)
    .find(line => line.status === 'waiting' || line.status === 'pending');

  const isMyTurn = currentTurnLine && currentTurnLine.approver_id === currentUser.id;

  const handleAction = async (action: 'approve' | 'reject') => {
    // 💡 TypeScript 에러 4개를 한 번에 잠재우는 마법의 방어 코드
    if (!currentTurnLine) return; 

    if (!opinion && action === 'reject') {
      return alert('반려 시에는 반드시 사유를 입력해야 합니다.');
    }
    if (!confirm(`${action === 'approve' ? '승인' : '반려'} 하시겠습니까?`)) return;

    setProcessing(true);
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const now = new Date().toISOString();

      // 1. 결재선(approval_lines) 상태 업데이트
      const { error: lineError } = await supabase
        .from('approval_lines')
        .update({ status: newStatus, acted_at: now, opinion: opinion })
        .eq('id', currentTurnLine.id);
      if (lineError) throw new Error(`결재선 업데이트 실패: ${lineError.message}`);

      // 2. 결재 이력(approval_histories) 저장
      const { error: historyError } = await supabase
        .from('approval_histories')
        .insert([{
          approval_doc_id: docId,
          approval_line_id: currentTurnLine.id,
          actor_id: currentUser.id,
          action_type: action,
          action_comment: opinion
        }]);
      if (historyError) throw new Error(`결재이력 저장 실패: ${historyError.message}`);

      // 3. 최종 결재자 여부 확인
      const isLastApprover = Math.max(...lines.map(l => l.line_no)) === currentTurnLine.line_no;

      if (action === 'reject') {
        await supabase.from('approval_docs').update({ status: 'rejected', completed_at: now }).eq('id', docId);
        await supabase.from('outbound_requests').update({ status: 'rejected' }).eq('approval_doc_id', docId);
      } 
      else if (isLastApprover && action === 'approve') {
        // 🌟 최종 승인 시: 문서 승인 처리 + 재고 차감 로직 실행 🌟
        await supabase.from('approval_docs').update({ status: 'approved', completed_at: now }).eq('id', docId);
        
        // 출고요청서 마스터 가져오기
        const { data: reqData, error: reqError } = await supabase
          .from('outbound_requests')
          .update({ status: 'approved' })
          .eq('approval_doc_id', docId)
          .select('id').single();
          
        // 💡 TypeScript 에러 방어: reqData가 없을 경우 에러 던지기
        if (reqError || !reqData) throw new Error(`출고요청서 조회 실패: ${reqError?.message}`);

        // 출고 요청된 품목 리스트 가져오기
        const { data: reqItems } = await supabase
          .from('outbound_request_items')
          .select('*')
          .eq('outbound_request_id', reqData.id);

        if (reqItems && reqItems.length > 0) {
          for (const item of reqItems) {
            const { data: invData } = await supabase
              .from('inventory')
              .select('*')
              .eq('item_id', item.item_id)
              .single();

            if (invData) {
              await supabase
                .from('inventory')
                .update({ 
                  current_qty: Number(invData.current_qty) - Number(item.qty),
                  available_qty: Number(invData.available_qty) - Number(item.qty)
                })
                .eq('id', invData.id);
            } else {
              await supabase
                .from('inventory')
                .insert([{
                  item_id: item.item_id,
                  current_qty: -Number(item.qty),
                  available_qty: -Number(item.qty),
                  quarantine_qty: 0
                }]);
            }

            // 수불부 (inventory_transactions) 기록 저장
            await supabase
              .from('inventory_transactions')
              .insert([{
                trans_date: now,
                trans_type: 'OUTBOUND',      // 출고 타입
                item_id: item.item_id,
                qty: item.qty,
                ref_table: 'outbound_requests', 
                ref_id: reqData.id,
                created_by: currentUser.id
              }]);
          }
        }
      } else {
         await supabase
          .from('approval_docs')
          .update({ current_line_no: currentTurnLine.line_no + 1 })
          .eq('id', docId);
      }

      alert('결재 처리가 완료되었습니다.');
      router.refresh();

    } catch (err: any) {
      alert('오류 발생: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (!isMyTurn) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 border border-yellow-200">
        현재 사용자({currentUser?.user_metadata?.name || '로그인 유저'})에게는 승인 / 반려 권한이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div>
        <h3 className="font-bold text-blue-900">결재 처리</h3>
        <p className="text-xs text-blue-700 mt-1">현재 문서의 승인 / 반려를 처리합니다.</p>
      </div>

      <div>
        <label className="block text-xs font-bold text-blue-800 mb-1">결재 의견</label>
        <textarea
          className="w-full rounded border border-blue-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          rows={3}
          placeholder="승인 또는 반려 사유를 입력하세요."
          value={opinion}
          onChange={(e) => setOpinion(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleAction('approve')}
          disabled={processing}
          className="flex-1 rounded bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
        >
          {processing ? '처리 중...' : '결재 승인'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={processing}
          className="flex-1 rounded border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors shadow-sm disabled:opacity-50"
        >
          반려
        </button>
      </div>
    </div>
  );
}