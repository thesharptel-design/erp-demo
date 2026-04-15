'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ApprovalActionButtons from '@/components/ApprovalActionButtons'; // 🌟 핵심: 우리가 만든 완벽한 결재 모듈!

export default function OutboundRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: targetId } = use(params);

  const [requestData, setRequestData] = useState<any>(null);
  const [requestItems, setRequestItems] = useState<any[]>([]);
  const [approvalLines, setApprovalLines] = useState<any[]>([]);
  const [approvalDoc, setApprovalDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetailData();
  }, [targetId]);

  const fetchDetailData = async () => {
    try {
      setLoading(true);

      // 1. 출고요청 마스터 (+ 기안자 이름)
      const { data: header } = await supabase
        .from('outbound_requests')
        .select(`*, requester:app_users!requester_id(user_name)`)
        .eq('id', targetId).single();

      if (header) {
        setRequestData(header);

        // 2. 결재 마스터 및 결재선 가져오기
        if (header.approval_doc_id) {
          const { data: doc } = await supabase
            .from('approval_docs')
            .select('*')
            .eq('id', header.approval_doc_id).single();
          setApprovalDoc(doc);

          const { data: lines } = await supabase
            .from('approval_lines')
            .select(`*, approver:app_users!approver_id(user_name)`)
            .eq('approval_doc_id', header.approval_doc_id)
            .order('line_no', { ascending: true });
          setApprovalLines(lines || []);
        }

        // 3. 품목 리스트 가져오기 (품목코드, 규격, 단위 포함)
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
  if (!requestData) return <div className="p-10 text-center text-red-500 font-bold">요청서를 찾을 수 없습니다.</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 text-black font-sans">
      
      {/* 상단 헤더 */}
      <div className="flex justify-between items-end border-b-2 border-black pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter">출고요청서 상세내역</h1>
          <p className="text-gray-500 font-bold mt-2">문서번호: {requestData.req_no} | 요청일: {requestData.req_date}</p>
        </div>
        <button onClick={() => router.push('/outbound-requests')} className="px-5 py-2 border-2 border-black font-bold rounded-lg hover:bg-gray-100 transition-all">
          목록으로 돌아가기
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          {/* 1. 기본 정보 섹션 */}
          <section className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-black mb-4 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-blue-600 rounded-full"></span> 문서 기본 정보
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-gray-500 font-bold mb-1 text-xs uppercase tracking-widest">기안자</p>
                <p className="font-black text-lg">{requestData.requester?.user_name}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-gray-500 font-bold mb-1 text-xs uppercase tracking-widest">진행 상태</p>
                <p className={`font-black text-lg ${requestData.status === 'approved' ? 'text-red-600' : 'text-blue-600'}`}>
                  {requestData.status === 'approved' ? '최종 승인 완료' : requestData.status === 'rejected' ? '반려됨' : '결재 진행중'}
                </p>
              </div>
              <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-gray-500 font-bold mb-1 text-xs uppercase tracking-widest">요청 사유 (목적)</p>
                <p className="font-bold whitespace-pre-wrap leading-relaxed">{requestData.purpose || '입력된 내용이 없습니다.'}</p>
              </div>
            </div>
          </section>

          {/* 2. 품목 리스트 섹션 (의뢰인이 찾으시던 디테일!) */}
          <section className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-black mb-4 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-green-500 rounded-full"></span> 출고 요청 품목
            </h2>
            <div className="overflow-hidden rounded-xl border-2 border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-100 text-gray-500">
                  <tr>
                    <th className="p-4 font-black">No.</th>
                    <th className="p-4 font-black">품목코드</th>
                    <th className="p-4 font-black">품목명</th>
                    <th className="p-4 font-black">규격 / 단위</th>
                    <th className="p-4 font-black text-center">요청 수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requestItems.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold">등록된 품목이 없습니다.</td></tr>
                  ) : (
                    requestItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-bold text-gray-400">{item.line_no || idx + 1}</td>
                        <td className="p-4 font-black text-blue-600 tracking-wider">{item.item?.item_code}</td>
                        <td className="p-4 font-bold">{item.item?.item_name}</td>
                        <td className="p-4 text-gray-500 text-xs font-bold">{item.item?.item_spec || '-'} / {item.item?.unit}</td>
                        <td className="p-4 font-black text-center text-lg text-red-500">{item.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 3. 우측: 결재선 도장 및 액션 버튼 */}
        <aside className="space-y-6">
          {/* 결재선 도장 (기존 감성 유지하되 ERP 스타일로) */}
          <section className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 border-b-2 border-gray-100 pb-2 text-center">Approval Line</h2>
            <div className="flex flex-wrap gap-2 justify-center">
              {approvalLines.map(line => (
                <div key={line.id} className="w-[4.5rem] border-2 border-gray-200 rounded-lg text-center text-xs overflow-hidden bg-white shadow-sm">
                  <div className="bg-gray-50 py-1.5 border-b-2 border-gray-200 font-black text-gray-600">
                    {line.approver_role === 'reviewer' ? '검토' : '결재'}
                  </div>
                  <div className="h-14 flex items-center justify-center font-bold px-1 text-[11px] leading-tight relative overflow-hidden">
                    {line.status === 'approved' ? (
                      <span className="text-red-500 font-black border-2 border-red-500 rounded-full w-12 h-12 flex items-center justify-center rotate-[-15deg] bg-white absolute">승인</span>
                    ) : line.status === 'rejected' ? (
                      <span className="text-red-700 font-black border-2 border-red-700 rounded-full w-12 h-12 flex items-center justify-center rotate-[-15deg] bg-red-50 absolute">반려</span>
                    ) : (
                      <span className="text-gray-600 truncate px-1">{line.approver?.user_name}</span>
                    )}
                  </div>
                  <div className={`py-1.5 border-t-2 border-gray-200 font-black text-[10px] tracking-wider ${line.status === 'waiting' || line.status === 'pending' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 bg-gray-50'}`}>
                    {line.status === 'approved' && line.acted_at ? line.acted_at.slice(5, 10).replace('-', '/') : line.status === 'rejected' ? '반려됨' : '대기중'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 🌟 우리가 만든 완벽한 결재 모듈 탑재 (여기서 누르면 재고 차감!) 🌟 */}
          {approvalDoc && approvalLines.length > 0 && (
            <ApprovalActionButtons 
              docId={approvalDoc.id} 
              docNo={approvalDoc.doc_no} 
              lines={approvalLines} 
            />
          )}
        </aside>
      </div>
    </div>
  );
}