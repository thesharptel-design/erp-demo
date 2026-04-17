'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewOutboundPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [userProfile, setUserProfile] = useState<any>(null); 
  const [items, setItems] = useState<any[]>([]); 
  const [appUsers, setAppUsers] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState([{ item_id: '', quantity: 1 }]);
  
  const [reviewers, setReviewers] = useState<string[]>(['']); 
  const [approvers, setApprovers] = useState<string[]>(['']); 

  const getDeptName = (id: number) => {
    const depts: any = {
      0: '시스템관리', 1: '관리부', 2: '영업부', 3: '구매부', 4: '생산부', 5: '품질관리부', 6: '자재부'
    };
    return depts[id] || '미소속';
  };

  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('app_users').select('*').eq('id', user.id).single();
        setUserProfile(profile);
      }
      const { data: itemsData } = await supabase.from('items').select('*');
      setItems(itemsData || []);
      const { data: usersData } = await supabase.from('app_users').select('id, user_name, role_name, dept_id').neq('id', user?.id || '');
      setAppUsers(usersData || []);
    };
    initData();
  }, []);

  const addItemRow = () => setSelectedItems([...selectedItems, { item_id: '', quantity: 1 }]);
  const removeItemRow = (index: number) => setSelectedItems(selectedItems.filter((_, i) => i !== index));

  const addReviewer = () => setReviewers([...reviewers, '']);
  const removeReviewer = (index: number) => setReviewers(reviewers.filter((_, i) => i !== index));
  const updateReviewer = (index: number, val: string) => {
    const newArr = [...reviewers]; newArr[index] = val; setReviewers(newArr);
  };

  const addApprover = () => setApprovers([...approvers, '']);
  const removeApprover = (index: number) => setApprovers(approvers.filter((_, i) => i !== index));
  const updateApprover = (index: number, val: string) => {
    const newArr = [...approvers]; newArr[index] = val; setApprovers(newArr);
  };

  const generateDocNo = (prefix: string) => {
    const today = new Date();
    const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
    const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${dateStr}-${randomStr}`;
  };

  const handleSave = async (isSubmit: boolean) => {
    const validReviewers = reviewers.filter(id => id.trim() !== '');
    const validApprovers = approvers.filter(id => id.trim() !== '');

    if (!title) return alert('기안 제목을 입력하세요.');
    if (isSubmit && validApprovers.length === 0) return alert('최종 결재자를 최소 1명 지정하세요.');

    setLoading(true);
    try {
      // 1. [STEP 1] 결재 마스터 (approval_docs)
      const docNo = generateDocNo('APP');
      const { data: doc, error: docError } = await supabase
        .from('approval_docs')
        .insert([{
          doc_no: docNo,
          title: title,
          content: description,
          writer_id: userProfile.id,
          dept_id: userProfile.dept_id,
          status: isSubmit ? 'submitted' : 'draft',
          submitted_at: isSubmit ? new Date().toISOString() : null,
          current_line_no: isSubmit ? 1 : null, 
          doc_type: 'outbound_request'
        }])
        .select().single();
        
      if (docError) throw new Error(`[결재마스터 에러] ${docError.message}`);

      // 🌟 2. [STEP 2] 결재선 (approval_lines) 핵심 버그 수정!!
      const lines = [];
      let step = 1;

      for (const id of validReviewers) {
        lines.push({ 
          approval_doc_id: doc.id, 
          approver_id: id, 
          line_no: step, 
          approver_role: 'review',
          // 🌟 여기가 핵심입니다! 상신 시 1번 타자에게만 'pending'(지금 네 차례야!) 부여
          status: (isSubmit && step === 1) ? 'pending' : 'waiting' 
        });
        step++;
      }
      
      for (const id of validApprovers) {
        lines.push({ 
          approval_doc_id: doc.id, 
          approver_id: id, 
          line_no: step, 
          approver_role: 'approve', 
          // 🌟 검토자가 없고 바로 결재자일 수도 있으니 여기도 동일 로직 적용
          status: (isSubmit && step === 1) ? 'pending' : 'waiting'
        });
        step++;
      }

      if (lines.length > 0) {
        const { error: lineError } = await supabase.from('approval_lines').insert(lines);
        if (lineError) throw new Error(`[결재선 에러] ${lineError.message}`);
      }

      // 3. [STEP 3] 출고 요청서 본문 (outbound_requests)
      const reqNo = generateDocNo('REQ');
      const { data: req, error: reqError } = await supabase
        .from('outbound_requests')
        .insert([{ 
          req_no: reqNo,
          requester_id: userProfile.id,
          purpose: description,
          approval_doc_id: doc.id,
          status: isSubmit ? 'submitted' : 'draft'
        }])
        .select().single();
        
      if (reqError) throw new Error(`[상세문서 에러] ${reqError.message}`);

      // 4. [STEP 4] 출고 요청 품목 (outbound_request_items)
      const itemInserts = selectedItems.map((si, idx) => ({ 
        outbound_request_id: req.id, 
        line_no: idx + 1,
        item_id: si.item_id, 
        qty: si.quantity 
      }));
      const { error: itemError } = await supabase.from('outbound_request_items').insert(itemInserts);
      
      if (itemError) throw new Error(`[품목저장 에러] ${itemError.message}`);

      // 5. [STEP 5] 결재 이력 (approval_histories)
      if (isSubmit) {
        const { error: historyError } = await supabase.from('approval_histories').insert([{
          approval_doc_id: doc.id,
          actor_id: userProfile.id,
          action_type: 'submit'
        }]);
        if (historyError) throw new Error(`[결재이력 에러] ${historyError.message}`);
      }

      // 모든 과정 성공!
      alert(isSubmit ? '상신 완료!' : '저장 완료!');
      router.push('/outbound-requests'); // 🌟 상신 완료 후 출고 요청 목록으로 보내는 게 자연스럽습니다
      
    } catch (err: any) {
      console.error(err);
      alert('저장 실패: ' + err.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto text-gray-800 font-sans">
      
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-300">
        <div>
          <h1 className="text-2xl font-bold">출고요청서 기안</h1>
          <p className="text-sm text-gray-500 mt-1">{getDeptName(userProfile?.dept_id)} | {userProfile?.user_name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave(false)} className="px-4 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm font-medium transition-colors">
            임시 저장
          </button>
          <button onClick={() => handleSave(true)} disabled={loading} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm">
            {loading ? '처리 중...' : '작성 후 상신'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 좌측: 문서 정보 및 품목 */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">문서 정보</h3>
            <input type="text" placeholder="기안 제목을 입력하세요" className="w-full p-2.5 border border-gray-300 rounded mb-3 text-sm focus:border-blue-500 outline-none transition-shadow" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea placeholder="요청 사유 상세" rows={4} className="w-full p-2.5 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none resize-none transition-shadow" value={description} onChange={e => setDescription(e.target.value)} />
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-700">품목 선택</h3>
              <button onClick={addItemRow} className="text-xs border border-gray-300 px-3 py-1.5 rounded bg-white hover:bg-gray-50 text-gray-600 font-medium transition-colors shadow-sm">
                + 품목 추가
              </button>
            </div>
            
            {/* 🌟 모바일 호환: 표(Table) 가로 스크롤 적용 구역 */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">품목명 / 코드</th>
                    <th className="px-4 py-3 w-32 text-center font-bold">수량</th>
                    <th className="px-4 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {selectedItems.map((si, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <select className="w-full p-2 border border-gray-300 rounded outline-none focus:border-blue-500 bg-white" value={si.item_id} onChange={e => {
                          const newArr = [...selectedItems]; newArr[idx].item_id = e.target.value; setSelectedItems(newArr);
                        }}>
                          <option value="">품목 선택...</option>
                          {items.map(i => <option key={i.id} value={i.id}>[{i.item_code}] {i.item_name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min="1" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-blue-500" value={si.quantity} onChange={e => {
                          const newArr = [...selectedItems]; newArr[idx].quantity = parseInt(e.target.value) || 0; setSelectedItems(newArr);
                        }} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => removeItemRow(idx)} className="text-gray-400 hover:text-red-500 font-black px-2 py-1">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 우측: 결재 라인 */}
        <aside>
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm sticky top-6">
            <h3 className="text-sm font-bold text-gray-700 mb-4 border-b border-gray-200 pb-2">결재 라인</h3>
            
            <div className="space-y-3">
              {/* 기안자 */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 shrink-0 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">기안</div>
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded p-2 text-sm text-gray-600 truncate">
                  {userProfile?.user_name || '로딩 중...'}
                </div>
              </div>

              {/* 검토자 */}
              {reviewers.map((id, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-9 h-9 shrink-0 rounded bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-500">검토</div>
                  <select className="flex-1 border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 bg-white" value={id} onChange={e => updateReviewer(idx, e.target.value)}>
                    <option value="">검토자 선택...</option>
                    {appUsers.map(u => <option key={u.id} value={u.id}>{u.user_name} ({getDeptName(u.dept_id)})</option>)}
                  </select>
                  <button onClick={() => removeReviewer(idx)} className="text-gray-400 hover:text-red-500 font-bold px-1">✕</button>
                </div>
              ))}
              <button onClick={addReviewer} className="w-full py-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors font-medium">
                + 검토 추가
              </button>

              {/* 결재자 */}
              {approvers.map((id, idx) => (
                <div key={idx} className="flex items-center gap-2 pt-2">
                  <div className="w-9 h-9 shrink-0 rounded bg-blue-600 flex items-center justify-center text-xs font-bold text-white">결재</div>
                  <select className="flex-1 border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 bg-white" value={id} onChange={e => updateApprover(idx, e.target.value)}>
                    <option value="">결재자 선택...</option>
                    {appUsers.map(u => <option key={u.id} value={u.id}>{u.user_name} ({getDeptName(u.dept_id)})</option>)}
                  </select>
                  <button onClick={() => removeApprover(idx)} className="text-gray-400 hover:text-red-500 font-bold px-1">✕</button>
                </div>
              ))}
              <button onClick={addApprover} className="w-full py-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors font-medium">
                + 결재 추가
              </button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}