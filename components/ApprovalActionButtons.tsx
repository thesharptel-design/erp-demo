'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ApprovalActionButtons({ doc, lines }: { doc: any, lines: any[] }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [opinion, setOpinion] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('app_users').select('*').eq('id', session.user.id).single();
        setCurrentUser(profile || session.user);
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="p-4 text-xs font-bold text-gray-400 animate-pulse text-center">권한 확인 중...</div>;
  if (!currentUser || !doc) return null;

  const myId = String(currentUser.id).toLowerCase();
  const isWriter = String(doc?.writer_id || '').toLowerCase() === myId;
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';

  const sortedLines = [...(lines || [])].sort((a, b) => a.line_no - b.line_no);
  const pendingLine = sortedLines.find(l => l.status === 'pending');
  const lastApprovedLine = [...sortedLines].reverse().find(l => l.status === 'approved');
  
  // 상황에 따른 현재 '공'
  const activeLine = (doc.status === 'approved' || doc.remarks?.includes('취소 요청') || doc.remarks?.includes('취소완료')) 
    ? (pendingLine || lastApprovedLine) 
    : pendingLine;

  const isMyTurn = activeLine && String(activeLine.approver_id).toLowerCase() === myId;
  const isAnyLineApproved = lines?.some(l => l.status === 'approved');

  const updateDoc = async (data: any) => {
    const { error } = await supabase.from('approval_docs').update(data).eq('id', doc.id);
    if (error) throw error;
  };

  const handleRecall = async () => {
    if (!confirm('기안을 회수하여 임시저장으로 되돌릴까요?')) return;
    setProcessing(true);
    try {
      await updateDoc({ status: 'draft', remarks: '기안 회수됨', current_line_no: 1 });
      await supabase.from('approval_lines').update({ status: 'waiting', acted_at: null, opinion: null }).eq('approval_doc_id', doc.id);
      alert('회수되었습니다.');
      router.refresh();
    } catch (e: any) { alert('오류: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleRequestCancel = async () => {
    const reason = prompt('취소 사유를 입력하세요 (필수):');
    if (!reason || reason.length < 2) return alert('사유를 입력해주세요.');
    setProcessing(true);
    try {
      await updateDoc({ remarks: '취소 요청 중', content: `${doc?.content || ''}\n\n[취소 요청 사유]: ${reason}` });
      alert('결재권자에게 취소 요청이 전달되었습니다.');
      router.refresh();
    } catch (e: any) { alert('오류: ' + e.message); }
    finally { setProcessing(false); }
  };

  // 🌟 [핵심 변경] 검토자/결재자 역할 분리 저장
  const handleApproveCancellation = async () => {
    if (!activeLine) return;
    if (!opinion.trim()) return alert('취소 승인 의견을 아래 칸에 필수로 입력해주세요.');

    setProcessing(true);
    try {
      if (doc.status !== 'approved') {
        await supabase.from('approval_lines').update({ status: 'rejected', acted_at: new Date().toISOString(), opinion }).eq('id', activeLine.id);
        await updateDoc({ status: 'rejected', remarks: '기안자 요청으로 결재 중 취소됨' });
        alert('결재 진행 중 취소 요청을 받아들여 문서를 종료했습니다.');
        router.push('/approvals');
        return;
      }

      // 🌟 현재 결재자의 역할 이름 판별
      const roleName = activeLine.approver_role === 'review' ? '검토자' : '결재자';

      if (activeLine.line_no === 1) {
        await updateDoc({ remarks: `${roleName} 취소승인` });
        alert(`취소가 승인되어 기안자에게 최종 권한이 넘어갔습니다.`);
      } else {
        await supabase.from('approval_lines').update({ status: 'waiting', acted_at: null, opinion }).eq('id', activeLine.id);
        await supabase.from('approval_lines').update({ status: 'pending' }).eq('approval_doc_id', doc.id).eq('line_no', activeLine.line_no - 1);
        await updateDoc({ current_line_no: activeLine.line_no - 1, remarks: `${roleName} 취소완료` });
        alert(`내 단계(${roleName})의 취소를 승인하고 이전 결재자에게 넘겼습니다.`);
      }
      router.refresh();
      setOpinion('');
    } catch (e: any) { 
      alert('데이터베이스 업데이트 오류: ' + e.message); 
    } finally { 
      setProcessing(false); 
    }
  };

  const handleFinalizeCancel = async () => {
    if (!confirm('최종 취소 처리와 함께 재고를 환원하시겠습니까?')) return;
    setProcessing(true);
    try {
      await supabase.rpc('finalize_outbound_cancellation', { p_doc_id: doc.id });
      await updateDoc({ status: 'rejected', remarks: '취소 완료(재고환원)' });
      alert('취소 및 재고 환원이 완료되었습니다.');
      router.push('/approvals');
    } catch (e: any) { alert('오류: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleGeneralAction = async (type: 'approved' | 'rejected') => {
    if (!activeLine) return;
    if (type === 'rejected' && !opinion) return alert('반려 사유를 입력하세요.');
    
    setProcessing(true);
    const now = new Date().toISOString();
    try {
      await supabase.from('approval_lines').update({ status: type, acted_at: now, opinion }).eq('id', activeLine.id);
      
      if (type === 'rejected') {
        await updateDoc({ status: 'rejected', remarks: '결재자 반려' });
      } else {
        const isLast = activeLine.line_no === sortedLines.length;
        if (isLast) {
          await updateDoc({ status: 'approved', completed_at: now });
        } else {
          await supabase.from('approval_lines').update({ status: 'pending' }).eq('approval_doc_id', doc.id).eq('line_no', activeLine.line_no + 1);
          await updateDoc({ current_line_no: activeLine.line_no + 1, status: 'in_review' });
        }
      }
      router.refresh();
      setOpinion('');
    } catch (e: any) { alert('오류: ' + e.message); }
    finally { setProcessing(false); }
  };

  const isCancellationRelay = doc?.remarks === '취소 요청 중' || (doc?.remarks?.includes('취소완료') && !doc?.remarks?.includes('재고환원'));

  return (
    <div className="bg-white border-2 border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
      {isAdmin && (
        <button onClick={async () => {
          if(!confirm('관리자 권한으로 강제 취소합니까?')) return;
          await supabase.rpc('finalize_outbound_cancellation', { p_doc_id: doc.id });
          await updateDoc({ status: 'rejected', remarks: '관리자 강제취소' });
          router.refresh();
        }} className="w-full border-2 border-gray-900 text-gray-900 py-2 rounded-xl font-bold text-[10px] opacity-30 hover:opacity-100 transition-all">ADMIN FORCE CANCEL</button>
      )}

      {isWriter && (
        <div className="space-y-2">
          {doc.status === 'submitted' && !isAnyLineApproved && (
            <button onClick={handleRecall} disabled={processing} className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black text-sm">기안 회수 (임시저장)</button>
          )}
          {(isAnyLineApproved || doc.status === 'approved') && !doc.remarks?.includes('취소') && doc.status !== 'rejected' && (
            <button onClick={handleRequestCancel} disabled={processing} className="w-full border-2 border-red-500 text-red-500 py-4 rounded-2xl font-black text-sm">결재 취소 승인 요청</button>
          )}
          {(doc.remarks?.includes('취소완료') && !doc.remarks?.includes('재고환원')) && (
            <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
               <p className="text-xs text-orange-600 font-bold text-center animate-pulse">상위 결재자들의 역순 취소가 진행 중입니다.</p>
            </div>
          )}
          {doc.remarks?.includes('취소승인') && (
            <button onClick={handleFinalizeCancel} disabled={processing} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black text-lg animate-bounce shadow-xl">최종 취소 및 재고환원</button>
          )}
        </div>
      )}

      {isMyTurn && (
        <div className="pt-2 border-t border-gray-50 space-y-3">
          {isCancellationRelay ? (
            <div className="bg-red-600 p-5 rounded-3xl shadow-xl">
               <p className="text-white text-center text-xs font-black mb-3 animate-pulse">
                 {doc.remarks === '취소 요청 중' ? '⚠️ 기안자가 취소를 요청했습니다.' : `⚠️ 역순 취소 릴레이 (${doc.remarks})`}
               </p>
               <textarea className="w-full bg-white text-gray-900 border-0 rounded-xl p-3 text-sm font-bold outline-none mb-3" placeholder="취소 승인 의견을 입력하세요 (필수)" value={opinion} onChange={e => setOpinion(e.target.value)} rows={2} />
               <button onClick={handleApproveCancellation} disabled={processing} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-sm hover:bg-black transition-colors">취소 요청 승인</button>
            </div>
          ) : (
            doc.status !== 'approved' && doc.status !== 'rejected' && (
              <>
                <textarea className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="결재 의견을 입력하세요" value={opinion} onChange={e => setOpinion(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <button onClick={() => handleGeneralAction('approved')} disabled={processing} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-sm">승인</button>
                  <button onClick={() => handleGeneralAction('rejected')} disabled={processing} className="flex-1 bg-red-100 text-red-600 py-4 rounded-2xl font-black text-sm">반려</button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}