'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import SearchableCombobox from '@/components/SearchableCombobox';

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 모달창 및 수정 폼 상태
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    id: '', user_name: '', email: '', phone: '', department: '', job_rank: '', new_password: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const departmentOptions = ['영업', '자재', '생산', '구매', 'QC', '경영지원', '관리'].map((v) => ({ value: v, label: v }));
  const rankOptions = ['사원', '대리', '과장', '차장', '부장', '이사', '대표'].map((v) => ({ value: v, label: v }));

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_users').select('*').neq('role_name', 'pending').order('department');
    setUsers(data || []);
    setSelectedIds([]); // 데이터 새로고침 시 체크박스 초기화
    setLoading(false);
  };

  const togglePermission = async (userId: string, column: string, currentState: boolean) => {
    const { error } = await supabase.from('app_users').update({ [column]: !currentState }).eq('id', userId);
    if (!error) fetchUsers();
  };

  // 🌟 [체크박스 로직] 전체 선택 / 해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(users.map(u => u.id));
    else setSelectedIds([]);
  };

  const handleSelectUser = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(userId => userId !== id));
  };

  // 🌟 [일괄 로직] 일괄 퇴사 처리 (is_active: false)
  const handleBulkRetire = async () => {
    if (selectedIds.length === 0) return alert('퇴사 처리할 직원을 선택해주세요.');
    if (!confirm(`선택한 ${selectedIds.length}명의 직원을 일괄 퇴사(비활성화) 처리하시겠습니까?`)) return;

    setLoading(true);
    let successCount = 0;
    for (const id of selectedIds) {
      const { error } = await supabase.from('app_users').update({ is_active: false }).eq('id', id);
      if (!error) successCount++;
    }
    
    alert(`✅ ${successCount}명 퇴사 처리 완료!`);
    fetchUsers();
  };

  // 🌟 [일괄 로직] 일괄 삭제 (보안 계정까지 완전 삭제)
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return alert('삭제할 직원을 선택해주세요.');
    if (!confirm(`🚨 경고: 선택한 ${selectedIds.length}명의 계정을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    setLoading(true);
    const res = await fetch('/api/admin/delete-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedIds })
    });

    if (res.ok) {
      alert('선택한 계정이 완전히 삭제되었습니다.');
      fetchUsers();
    } else {
      const err = await res.json();
      alert('삭제 실패: ' + err.error);
      setLoading(false);
    }
  };

  // 개별 상태 토글 (기존)
  const handleToggleActive = async (user: any) => {
    const newStatus = !user.is_active;
    const msg = newStatus ? "다시 활성화하시겠습니까?" : "퇴사 처리(로그인 차단)하시겠습니까?";
    if (!confirm(`${user.user_name}님을 ${msg}`)) return;

    const { error } = await supabase.from('app_users').update({ is_active: newStatus }).eq('id', user.id);
    if (error) alert("상태 변경 실패: " + error.message);
    else fetchUsers();
  };

  // 개별 완전 삭제 (기존)
  const handleDeleteUser = async (user: any) => {
    if (!confirm(`🚨 경고: [${user.user_name}]님의 계정을 보안 시스템에서 완전히 삭제하시겠습니까?`)) return;

    const res = await fetch('/api/admin/delete-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: [user.id] })
    });

    if (res.ok) {
      alert('계정이 완전히 삭제되었습니다.');
      fetchUsers();
    } else {
      const err = await res.json();
      alert('삭제 실패: ' + err.error);
    }
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditForm({
      id: user.id, user_name: user.user_name || '', email: user.email || '', 
      phone: user.phone || '', department: user.department || '', job_rank: user.job_rank || '', new_password: ''
    });
  };

  const handleUpdateUser = async () => {
    if (!editForm.user_name || !editForm.email) return alert('이름과 이메일은 필수입니다.');
    if (!confirm(`${editForm.user_name}님의 정보를 수정하시겠습니까?`)) return;

    setIsUpdating(true);
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });

    const result = await res.json();
    setIsUpdating(false);

    if (result.success) {
      alert('사용자 정보가 성공적으로 업데이트되었습니다.');
      setEditingUser(null);
      fetchUsers();
    } else {
      alert('에러 발생: ' + result.error);
    }
  };

  const handleDownloadUsersExcel = () => {
    const rows = users.map((u) => ({
      사번: u.employee_no ?? '-',
      이름: u.user_name ?? '-',
      이메일: u.email ?? '-',
      연락처: u.phone ?? '-',
      부서: u.department ?? '-',
      직급: u.job_rank ?? '-',
      역할: u.role_name ?? '-',
      재직상태: u.is_active ? '재직' : '퇴사',
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'users');
    XLSX.writeFile(wb, `ERP_사용자목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    // 🌟 전체 컨테이너 폭 축소: max-w-[1700px] -> max-w-[1500px]
    <div className="p-6 max-w-[1500px] mx-auto font-sans bg-gray-50 h-screen flex flex-col relative text-black">
      <header className="mb-4 flex-shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black uppercase text-blue-600 italic">User <span className="text-black">Permissions</span></h1>
          <p className="text-gray-500 text-[10px] font-bold mt-1">전체 직원 정보 관리 및 모듈별 접근 권한 설정 (이름을 클릭하여 정보 수정)</p>
        </div>
        
        {/* 🌟 우측 상단 일괄 처리 버튼 영역 */}
        <div className="flex gap-2">
          <button disabled={loading}
            onClick={handleDownloadUsersExcel}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-black shadow-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            ⬇️ 엑셀 다운로드
          </button>
          <button disabled={loading}
            onClick={handleBulkRetire}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg text-xs font-black shadow-sm hover:bg-gray-900 active:scale-95 transition-all disabled:opacity-50"
          >
            ⏸️ 일괄 퇴사
          </button>
          <button disabled={loading}
            onClick={handleBulkDelete}
            className="px-4 py-2 bg-white border-2 border-red-200 text-red-500 rounded-lg text-xs font-black shadow-sm hover:bg-red-50 active:scale-95 transition-all disabled:opacity-50"
          >
            🗑️ 일괄 삭제
          </button>
        </div>
      </header>

      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg flex-grow flex flex-col min-h-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-grow">
          {/* 🌟 테이블 최소 너비 축소: min-w-[1400px] -> min-w-[1200px] 및 패딩(px-4 -> px-3) 다이어트 */}
          <table className="w-full min-w-[1200px] text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm border-b-2">
              <tr className="text-gray-400 font-black text-[10px] uppercase">
                {/* 🌟 체크박스 헤더 추가 */}
                <th className="px-3 py-3 text-center w-10">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600 cursor-pointer" 
                    checked={users.length > 0 && selectedIds.length === users.length} 
                    onChange={(e) => handleSelectAll(e.target.checked)} 
                  />
                </th>
                <th className="px-3 py-3 text-left">직원 정보 (이름 | ID)</th>
                <th className="px-3 py-3 text-center border-r-2">부서/직급</th>
                <th className="px-3 py-3 text-center">기준정보</th>
                <th className="px-3 py-3 text-center">영업/구매</th>
                <th className="px-3 py-3 text-center">자재/재고</th>
                <th className="px-3 py-3 text-center">생산/BOM</th>
                <th className="px-3 py-3 text-center">품질(QC)</th>
                <th className="px-3 py-3 text-center">경영/관리</th>
                <th className="px-3 py-3 text-center text-blue-600 bg-gray-100">시스템관리</th>
                <th className="px-3 py-3 text-center bg-gray-100 border-l-2">계정 관리</th>
              </tr>
            </thead>
            <tbody className="divide-y-2">
              {users.map(user => (
                <tr key={user.id} className={`hover:bg-blue-50/20 ${!user.is_active && 'bg-gray-50 opacity-60'}`}>
                  {/* 🌟 체크박스 열 추가 */}
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600 cursor-pointer"
                      checked={selectedIds.includes(user.id)}
                      onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditModal(user)} className="font-black text-sm text-blue-600 hover:underline flex items-center gap-1">
                        {user.user_name}
                        <span className="text-[9px] font-bold bg-gray-100 border px-1 py-0.5 rounded text-gray-400 no-underline hover:bg-gray-200">수정</span>
                      </button>
                      <span className="text-gray-300">|</span>
                      <span className="text-[11px] font-bold text-gray-500 tracking-tight">{user.email}</span>
                      {!user.is_active && <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] font-black rounded italic">RETIRED</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center border-r-2"><span className="bg-gray-100 px-2 py-1 rounded font-black">{user.department}</span> <span className="text-gray-500 font-bold ml-1">{user.job_rank}</span></td>
                  
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_manage_master} onChange={() => togglePermission(user.id, 'can_manage_master', !!user.can_manage_master)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_sales_manage} onChange={() => togglePermission(user.id, 'can_sales_manage', !!user.can_sales_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_material_manage} onChange={() => togglePermission(user.id, 'can_material_manage', !!user.can_material_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_production_manage} onChange={() => togglePermission(user.id, 'can_production_manage', !!user.can_production_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_qc_manage} onChange={() => togglePermission(user.id, 'can_qc_manage', !!user.can_qc_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={!!user.can_admin_manage} onChange={() => togglePermission(user.id, 'can_admin_manage', !!user.can_admin_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="px-3 py-3 text-center bg-gray-50"><input type="checkbox" checked={!!user.can_manage_permissions} onChange={() => togglePermission(user.id, 'can_manage_permissions', !!user.can_manage_permissions)} className="w-5 h-5 accent-blue-600 cursor-pointer" /></td>
                  
                  <td className="px-3 py-3 text-center bg-gray-50/50 border-l-2">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleToggleActive(user)} className={`px-2 py-1.5 rounded text-[10px] font-black transition-all ${user.is_active ? 'bg-white border border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-500' : 'bg-red-500 text-white'}`}>
                        {user.is_active ? '퇴사' : '복직'}
                      </button>
                      <button onClick={() => handleDeleteUser(user)} className="px-2 py-1.5 bg-white border border-red-200 text-red-400 rounded text-[10px] font-black hover:bg-red-600 hover:text-white hover:border-red-600 transition-all">
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🌟 모달창 (변경 없음) */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-2 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b-2 border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-black text-lg flex items-center gap-2">
                <span className="w-2 h-5 bg-blue-600 rounded-full"></span>
                직원 상세 정보 수정
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-black font-bold text-xl">&times;</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">이름</label>
                  <input type="text" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none font-bold text-sm" value={editForm.user_name} onChange={e => setEditForm({...editForm, user_name: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">연락처</label>
                  <input type="text" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none font-bold text-sm" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">로그인 이메일 (변경 시 로그인 아이디도 바뀜)</label>
                  <input type="email" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none font-bold text-sm bg-yellow-50" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                </div>
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">부서</label>
                  <SearchableCombobox
                    value={editForm.department}
                    onChange={(v) => setEditForm({ ...editForm, department: v })}
                    options={departmentOptions}
                    placeholder="선택"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">직급</label>
                  <SearchableCombobox
                    value={editForm.job_rank}
                    onChange={(v) => setEditForm({ ...editForm, job_rank: v })}
                    options={rankOptions}
                    placeholder="선택"
                  />
                </div>
              </div>

              <div className="mt-6 p-4 border-2 border-red-100 bg-red-50 rounded-xl">
                <label className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1 block flex items-center gap-1">
                  🚨 비밀번호 강제 재설정
                </label>
                <p className="text-xs text-red-400 mb-2 font-medium">비밀번호를 입력하면 기존 비밀번호가 무시되고 덮어씌워집니다. 변경하지 않으려면 비워두세요.</p>
                <input 
                  type="text" 
                  placeholder="새로운 비밀번호 입력" 
                  className="w-full p-3 border-2 border-red-200 rounded-lg focus:border-red-500 outline-none font-bold text-sm" 
                  value={editForm.new_password} 
                  onChange={e => setEditForm({...editForm, new_password: e.target.value})} 
                />
              </div>
            </div>

            <div className="p-5 border-t-2 border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setEditingUser(null)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-gray-500 hover:bg-gray-200 transition-colors">취소</button>
              <button onClick={handleUpdateUser} disabled={isUpdating} className="px-6 py-2.5 bg-black text-white rounded-xl font-black text-sm hover:bg-blue-600 active:scale-95 transition-all shadow-md disabled:bg-gray-400">
                {isUpdating ? '저장 중...' : '변경사항 즉시 저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}