'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🌟 모달창 띄우기를 위한 상태 관리
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    id: '', user_name: '', email: '', phone: '', department: '', job_rank: '', new_password: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_users').select('*').neq('role_name', 'pending').order('department');
    setUsers(data || []);
    setLoading(false);
  };

  const togglePermission = async (userId: string, column: string, currentState: boolean) => {
    const { error } = await supabase.from('app_users').update({ [column]: !currentState }).eq('id', userId);
    if (!error) fetchUsers();
  };

  // 🌟 이름 클릭 시 수정 모달창 열기
  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditForm({
      id: user.id,
      user_name: user.user_name || '',
      email: user.email || '',
      phone: user.phone || '',
      department: user.department || '',
      job_rank: user.job_rank || '',
      new_password: '' // 비밀번호는 기본적으로 비워둠 (입력하면 변경됨)
    });
  };

  // 🌟 정보 업데이트 API 호출
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
      setEditingUser(null); // 모달 닫기
      fetchUsers(); // 목록 새로고침
    } else {
      alert('에러 발생: ' + result.error);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto font-sans bg-gray-50 h-screen flex flex-col relative">
      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-black uppercase text-blue-600 italic">User <span className="text-black">Permissions</span></h1>
        <p className="text-gray-500 text-[10px] font-bold">정식 등록된 직원의 세부 모듈 접근 권한 설정 (이름을 클릭하여 정보 수정)</p>
      </header>

      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg flex-grow flex flex-col min-h-0">
        <div className="overflow-y-auto custom-scrollbar flex-grow">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm border-b-2">
              <tr className="text-gray-400 font-black text-[10px] uppercase">
                <th className="p-4 text-left">직원 정보 (수정)</th>
                <th className="p-4 text-center border-r-2">부서/직급</th>
                <th className="p-4 text-center">기준정보</th>
                <th className="p-4 text-center">영업/구매</th>
                <th className="p-4 text-center text-blue-600">자재/재고</th>
                <th className="p-4 text-center">생산/BOM</th>
                <th className="p-4 text-center">품질(QC)</th>
                <th className="p-4 text-center text-blue-600">경영/관리</th>
                <th className="p-4 text-center bg-gray-100">시스템관리</th>
              </tr>
            </thead>
            <tbody className="divide-y-2">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-blue-50/20">
                  <td className="p-4">
                    <div className="flex flex-col items-start gap-1.5">
                      {/* 🌟 이름 버튼 (수정 아이콘을 더 깔끔하게 버튼 안으로 통합) */}
                      <button 
                        onClick={() => openEditModal(user)} 
                        className="font-black text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5 transition-colors"
                      >
                        {user.user_name} 
                        <span className="text-[9px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded no-underline font-bold hover:bg-gray-200">
                          ✏️ 수정
                        </span>
                      </button>
                      
                      {/* 🌟 이메일(ID) 가시성 대폭 강화 */}
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md shadow-sm">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">ID</span>
                        <span className="text-[11px] font-bold text-gray-800 tracking-tight">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center border-r-2"><span className="bg-gray-100 px-2 py-1 rounded font-black">{user.department}</span> {user.job_rank}</td>
                  
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_manage_master} onChange={() => togglePermission(user.id, 'can_manage_master', !!user.can_manage_master)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_po_create} onChange={() => togglePermission(user.id, 'can_po_create', !!user.can_po_create)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_material_manage} onChange={() => togglePermission(user.id, 'can_material_manage', !!user.can_material_manage)} className="w-5 h-5 accent-blue-600 cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_production_manage} onChange={() => togglePermission(user.id, 'can_production_manage', !!user.can_production_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_qc_manage} onChange={() => togglePermission(user.id, 'can_qc_manage', !!user.can_qc_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_admin_manage} onChange={() => togglePermission(user.id, 'can_admin_manage', !!user.can_admin_manage)} className="w-5 h-5 accent-blue-600 cursor-pointer" /></td>
                  <td className="p-4 text-center bg-gray-50"><input type="checkbox" checked={!!user.can_manage_permissions} onChange={() => togglePermission(user.id, 'can_manage_permissions', !!user.can_manage_permissions)} className="w-5 h-5 accent-gray-800 cursor-pointer" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🌟 관리자 전용 직원 정보 수정 모달창 */}
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
                  <select className="w-full p-3 border-2 border-gray-100 rounded-xl bg-white font-bold text-sm focus:border-black outline-none" value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})}>
                    <option value="">선택</option><option value="영업">영업</option><option value="자재">자재</option><option value="생산">생산</option><option value="구매">구매</option><option value="QC">QC</option><option value="경영지원">경영지원</option><option value="관리">관리</option>
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">직급</label>
                  <select className="w-full p-3 border-2 border-gray-100 rounded-xl bg-white font-bold text-sm focus:border-black outline-none" value={editForm.job_rank} onChange={e => setEditForm({...editForm, job_rank: e.target.value})}>
                    <option value="">선택</option><option value="사원">사원</option><option value="대리">대리</option><option value="과장">과장</option><option value="차장">차장</option><option value="부장">부장</option><option value="이사">이사</option><option value="대표">대표</option>
                  </select>
                </div>
              </div>

              {/* 🌟 비밀번호 강제 초기화 구역 */}
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