'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// 🌟 부서별 자동 권한표 
const getDefaultPerms = (dept: string) => ({
  can_manage_master: dept === '관리' || dept === '경영지원' || dept === '관리팀' || dept === '경영지원팀',
  can_po_create: dept === '영업' || dept === '구매' || dept === '영업팀' || dept === '구매팀',
  can_material_manage: dept === '자재' || dept === '자재팀',
  can_production_manage: dept === '생산' || dept === '생산팀',
  can_qc_manage: dept === 'QC' || dept === 'QC팀' || dept === '품질관리부',
  can_admin_manage: dept === '관리' || dept === '경영지원' || dept === '관리팀' || dept === '경영지원팀',
  can_manage_permissions: false
});

export default function UserApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({ 
    user_name: '', email: '', password: '', password_confirm: '', phone: '', department: '', job_rank: '' 
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPendingUsers(); }, []);

  const fetchPendingUsers = async () => {
    setLoading(true);
    // 🌟 승인 대기중(pending)인 사람만 불러옵니다.
    const { data } = await supabase.from('app_users').select('*').eq('role_name', 'pending').order('created_at', { ascending: false });
    setPendingUsers(data || []);
    setSelectedIds([]); // 체크박스 초기화
    setLoading(false);
  };

  // 🌟 전체 선택 / 해제 로직
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(pendingUsers.map(u => u.id));
    else setSelectedIds([]);
  };

  const handleSelectUser = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(userId => userId !== id));
  };

  // 🌟 일괄 승인 + 부서별 권한 자동 부여 로직
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return alert('승인할 직원을 선택해주세요.');
    if (!confirm(`선택한 ${selectedIds.length}명의 직원을 일괄 승인하시겠습니까?\n(부서에 맞춰 권한이 자동 부여됩니다)`)) return;

    setLoading(true);
    let successCount = 0;

    for (const id of selectedIds) {
      const user = pendingUsers.find(u => u.id === id);
      if (user) {
        const autoPerms = getDefaultPerms(user.department); // 부서별 권한 뽑기
        const { error } = await supabase.from('app_users').update({ 
          role_name: 'staff', 
          ...autoPerms // 권한 자동 적용
        }).eq('id', id);
        
        if (!error) successCount++;
      }
    }
    
    alert(`${successCount}명 승인 완료!`);
    fetchPendingUsers();
  };

  // 관리자 직접 등록 (등록 시에도 자동 권한 적용)
  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.user_name) return alert('필수 정보를 입력해주세요.');
    setLoading(true);
    
    const autoPerms = getDefaultPerms(newUser.department);
    
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, role_name: 'staff', ...autoPerms })
    });
    
    if (res.ok) {
      alert('신규 계정이 등록 및 승인되었습니다!');
      setNewUser({ user_name: '', email: '', password: '', password_confirm: '', phone: '', department: '', job_rank: '' });
      fetchPendingUsers();
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto font-sans bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-black uppercase text-blue-600 italic">Registration <span className="text-black">Approval</span></h1>
        <p className="text-gray-500 text-[10px] font-bold">신규 직원 가입 승인 및 일괄 등록</p>
      </header>

      {/* 1. 직원 개별/일괄 등록 폼 (기존과 UI 동일) */}
      <section className="bg-white border-2 border-black p-6 rounded-2xl mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-black flex items-center gap-2"><span className="w-1.5 h-5 bg-blue-600 rounded-full"></span>관리자 직접 직원 등록</h2>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-black shadow-sm">📗 엑셀 일괄 등록</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
          <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">이름</label><input type="text" className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.user_name} onChange={e => setNewUser({...newUser, user_name: e.target.value})} /></div>
          <div className="col-span-2 space-y-1"><label className="text-[9px] font-black text-gray-400">이메일 ID</label><input type="email" className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
          <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">비밀번호</label><input type="password" className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
          <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">연락처</label><input type="text" className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} /></div>
          <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">부서</label><select className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})}><option value="">선택</option><option value="영업">영업</option><option value="자재">자재</option><option value="생산">생산</option><option value="QC">QC</option><option value="관리">관리</option></select></div>
          <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">직급</label><select className="w-full p-2.5 border-2 rounded-lg font-bold text-xs" value={newUser.job_rank} onChange={e => setNewUser({...newUser, job_rank: e.target.value})}><option value="">선택</option><option value="사원">사원</option><option value="대리">대리</option><option value="과장">과장</option></select></div>
        </div>
        <button onClick={handleCreateUser} className="w-full bg-black text-white p-3 rounded-xl font-black text-sm">직원 등록 및 자동 권한부여</button>
      </section>

      {/* 2. 승인 대기자 목록 (모두 선택 기능) */}
      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-4 border-b-2 bg-orange-50 flex justify-between items-center">
          <h2 className="text-sm font-black text-orange-800">🚨 가입 승인 대기 목록 ({pendingUsers.length}명)</h2>
          <button onClick={handleBulkApprove} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-xs font-black shadow-md hover:bg-orange-700">체크된 직원 일괄 승인하기</button>
        </div>
        
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 border-b-2">
            <tr>
              <th className="p-4 text-center w-12">
                <input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" 
                  checked={pendingUsers.length > 0 && selectedIds.length === pendingUsers.length}
                  onChange={(e) => handleSelectAll(e.target.checked)} 
                />
              </th>
              <th className="p-4 font-black text-[10px] text-gray-400 uppercase">직원 정보</th>
              <th className="p-4 font-black text-[10px] text-gray-400 uppercase">연락처</th>
              <th className="p-4 font-black text-[10px] text-gray-400 uppercase">부서/직급</th>
              <th className="p-4 font-black text-[10px] text-gray-400 uppercase">가입일시</th>
            </tr>
          </thead>
          <tbody className="divide-y-2">
            {pendingUsers.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-gray-400 font-bold">승인 대기 중인 직원이 없습니다.</td></tr>
            ) : (
              pendingUsers.map(user => (
                <tr key={user.id} className="hover:bg-orange-50/30">
                  <td className="p-4 text-center">
                    <input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer"
                      checked={selectedIds.includes(user.id)}
                      onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-4"><div className="font-black text-sm">{user.user_name}</div><div className="text-gray-400">{user.email}</div></td>
                  <td className="p-4 font-bold text-gray-600">{user.phone}</td>
                  <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded font-black">{user.department}</span> {user.job_rank}</td>
                  <td className="p-4 text-gray-400">{new Date(user.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}