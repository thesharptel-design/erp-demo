'use client';

import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { generateNextDroDocNo } from '@/lib/approval-doc-no';
import { useRouter } from 'next/navigation';
import { APPROVAL_ROLES, getApprovalRoleLabel } from '@/lib/approval-roles';
import { buildApprovalLines, buildApprovalParticipantsRows, normalizeParticipants } from '@/lib/approval-participants';
import SearchableCombobox from '@/components/SearchableCombobox';

export default function NewOutboundPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [userProfile, setUserProfile] = useState<any>(null); 
  const [items, setItems] = useState<any[]>([]); 
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState([{ item_id: '', quantity: 1 }]);
  const [itemSearchKeyword, setItemSearchKeyword] = useState('');
  
  const [warehouseId, setWarehouseId] = useState('');
  const [roleAssignees, setRoleAssignees] = useState<Record<string, string[]>>({
    reviewer: [''],
    pre_cooperator: [''],
    final_approver: [''],
    post_cooperator: [''],
    reference: [''],
  });
  const [roleSearches, setRoleSearches] = useState<Record<string, string>>({
    reviewer: '',
    pre_cooperator: '',
    final_approver: '',
    post_cooperator: '',
    reference: '',
  });

  const getDeptName = (id: number) => {
    const depts: any = {
      0: '시스템관리', 1: '관리부', 2: '영업부', 3: '구매부', 4: '생산부', 5: '품질관리부', 6: '자재부'
    };
    return depts[id] || '미소속';
  };

  const filteredUsersByRole = useMemo(
    () =>
      APPROVAL_ROLES.reduce<Record<string, any[]>>((acc, role) => {
        const keyword = (roleSearches[role] ?? '').trim().toLowerCase();
        acc[role] = appUsers.filter((u) => {
          if (!keyword) return true;
          return (
            String(u.user_name ?? '').toLowerCase().includes(keyword) ||
            String(u.role_name ?? '').toLowerCase().includes(keyword) ||
            String(getDeptName(u.dept_id)).toLowerCase().includes(keyword)
          );
        });
        return acc;
      }, {}),
    [appUsers, roleSearches]
  );
  const filteredItems = useMemo(() => {
    const keyword = itemSearchKeyword.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      String(item.item_code ?? '').toLowerCase().includes(keyword) ||
      String(item.item_name ?? '').toLowerCase().includes(keyword)
    );
  }, [items, itemSearchKeyword]);
  const itemOptions = useMemo(
    () =>
      filteredItems.map((item) => ({
        value: String(item.id),
        label: `[${item.item_code}] ${item.item_name}`,
        keywords: [item.item_code, item.item_name],
      })),
    [filteredItems]
  );

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
      const { data: warehouseData } = await supabase
        .from('warehouses')
        .select('id, name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      setWarehouses(warehouseData || []);
      if (warehouseData?.[0]?.id) setWarehouseId(String(warehouseData[0].id));
    };
    initData();
  }, []);

  const addItemRow = () => setSelectedItems([...selectedItems, { item_id: '', quantity: 1 }]);
  const removeItemRow = (index: number) => setSelectedItems(selectedItems.filter((_, i) => i !== index));

  const handleSave = async (isSubmit: boolean) => {
    const participants = normalizeParticipants(
      APPROVAL_ROLES.flatMap((role) =>
        (roleAssignees[role] ?? []).map((userId) => ({ role, userId }))
      )
    )

    if (!title) return alert('기안 제목을 입력하세요.');
    if (!warehouseId) return alert('출고 창고를 선택하세요.');
    if (!userProfile?.id) return alert('사용자 정보가 없어 저장할 수 없습니다.');
    if (userProfile?.dept_id === null || userProfile?.dept_id === undefined) {
      return alert('작성자 부서 정보가 없어 저장할 수 없습니다.');
    }
    if (isSubmit && !roleAssignees.final_approver.some((id) => id.trim())) return alert('최종 결재자를 지정하세요.');

    setLoading(true);
    try {
      // 1. [STEP 1] 결재 마스터 (approval_docs)
      const docNo = await generateNextDroDocNo(supabase);
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
      const linesToInsert = buildApprovalLines(doc.id, participants).map((line) => ({
        ...line,
        status: isSubmit ? line.status : 'waiting',
      }));
      const participantRows = buildApprovalParticipantsRows(doc.id, participants);

      if (linesToInsert.length > 0) {
        const { error: lineError } = await supabase.from('approval_lines').insert(linesToInsert);
        if (lineError) throw new Error(`[결재선 에러] ${lineError.message}`);
      }
      if (participantRows.length > 0) {
        const { error: participantError } = await supabase.from('approval_participants').insert(participantRows);
        if (participantError) throw new Error(`[참여자 에러] ${participantError.message}`);
      }

      // 3. [STEP 3] 출고 요청서 본문 (outbound_requests)
      const reqNo = docNo;
      const { data: req, error: reqError } = await supabase
        .from('outbound_requests')
        .insert([{ 
          req_no: reqNo,
          requester_id: userProfile.id,
          purpose: description,
          approval_doc_id: doc.id,
          warehouse_id: Number(warehouseId),
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
      router.push('/approvals');
      
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
            <SearchableCombobox
              className="mt-3"
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] }))}
              placeholder="출고 창고 선택..."
            />
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-700">품목 선택</h3>
              <button onClick={addItemRow} className="text-xs border border-gray-300 px-3 py-1.5 rounded bg-white hover:bg-gray-50 text-gray-600 font-medium transition-colors shadow-sm">
                + 품목 추가
              </button>
            </div>
            <input
              value={itemSearchKeyword}
              onChange={(e) => setItemSearchKeyword(e.target.value)}
              placeholder="품목 검색 (코드/명)"
              className="mb-3 w-full rounded border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            
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
                        <SearchableCombobox
                          value={String(si.item_id || '')}
                          onChange={(nextValue) => {
                            const newArr = [...selectedItems];
                            newArr[idx].item_id = nextValue;
                            setSelectedItems(newArr);
                          }}
                          options={itemOptions}
                          placeholder="품목 선택..."
                        />
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

              {APPROVAL_ROLES.map((role) => (
                <div key={role} className="space-y-1.5">
                  <input
                    value={roleSearches[role] ?? ''}
                    onChange={(e) =>
                      setRoleSearches((prev) => ({
                        ...prev,
                        [role]: e.target.value,
                      }))
                    }
                    placeholder={`${getApprovalRoleLabel(role)} 검색 (이름/부서)`}
                    className="w-full rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                  />
                  {(roleAssignees[role] ?? ['']).map((assignee, idx) => (
                    <div key={`${role}-${idx}`} className="flex items-center gap-2 pt-2">
                      <div className="w-20 h-9 shrink-0 rounded bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-700">
                        {idx === 0 ? getApprovalRoleLabel(role) : `${getApprovalRoleLabel(role)} ${idx + 1}`}
                      </div>
                      <SearchableCombobox
                        value={assignee}
                        onChange={(nextValue) =>
                          setRoleAssignees((prev) => {
                            const next = [...(prev[role] ?? [''])]
                            next[idx] = nextValue
                            return { ...prev, [role]: next }
                          })
                        }
                        options={(filteredUsersByRole[role] ?? []).map((u) => ({
                          value: u.id,
                          label: `${u.user_name} (${getDeptName(u.dept_id)})`,
                          keywords: [u.user_name, getDeptName(u.dept_id), u.role_name ?? ''],
                        }))}
                        placeholder={role === 'final_approver' ? '필수 선택' : '선택 안 함'}
                        className="flex-1"
                      />
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRoleAssignees((prev) => {
                              const next = [...(prev[role] ?? [''])]
                              next.splice(idx, 1)
                              return { ...prev, [role]: next.length > 0 ? next : [''] }
                            })
                          }
                          className="px-2 py-1 rounded border border-red-200 text-red-600 text-xs font-black"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="pl-[5.5rem]">
                    <button
                      type="button"
                      onClick={() =>
                        setRoleAssignees((prev) => ({
                          ...prev,
                          [role]: [...(prev[role] ?? ['']), ''],
                        }))
                      }
                      className="px-2 py-1 rounded border border-dashed border-blue-300 text-blue-700 text-xs font-black"
                    >
                      + {getApprovalRoleLabel(role)} 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}