'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ 
    user_name: '', email: '', password: '', role_name: '일반', dept_id: '1' 
  });

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  };

  const togglePermission = async (userId: string, column: string, currentState: boolean) => {
    const { error } = await supabase.from('app_users').update({ [column]: !currentState }).eq('id', userId);
    if (!error) fetchUsers();
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.user_name) {
      alert('모든 정보를 입력해주세요.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    const result = await res.json();
    if (result.success) {
      alert('신규 계정이 생성되었습니다!');
      setNewUser({ user_name: '', email: '', password: '', role_name: '일반', dept_id: '1' });
      fetchUsers();
    } else {
      alert('에러 발생: ' + result.error);
    }
    setLoading(false);
  };

  // 💡 부서 ID를 이름으로 변환해주는 헬퍼 함수
  const getDeptName = (id: number) => {
    const depts: any = {
      0: '시스템관리', 1: '관리부', 2: '영업부', 3: '구매부', 4: '생산부', 5: '품질관리부', 6: '자재부'
    };
    return depts[id] || '미소속';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto text-black font-sans">
      <header className="mb-10">
        <h1 className="text-3xl font-black tracking-tighter">사용자 관리 및 부서 배정</h1>
        <p className="text-gray-500 mt-2">새 직원을 등록하고 부서별 접근 권한을 설정합니다.</p>
      </header>
      
      {/* 1. 신규 사용자 등록 섹션 */}
      <section className="bg-white border-2 border-black p-8 rounded-2xl mb-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
          신규 직원 등록
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">이름</label>
            <input type="text" placeholder="홍길동" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none transition-all" value={newUser.user_name} onChange={e => setNewUser({...newUser, user_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">이메일 ID</label>
            <input type="email" placeholder="user@biogtp.com" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none transition-all" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">초기 비밀번호</label>
            <input type="password" placeholder="••••••••" className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-black outline-none transition-all" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">배정 부서</label>
            <select 
              className="w-full p-3 border-2 border-gray-100 rounded-xl bg-white font-bold text-sm focus:border-black outline-none cursor-pointer"
              value={newUser.dept_id}
              onChange={e => setNewUser({...newUser, dept_id: e.target.value})}
            >
              <option value="1">관리부</option>
              <option value="2">영업부</option>
              <option value="3">구매부</option>
              <option value="4">생산부</option>
              <option value="5">품질관리부</option>
              <option value="6">자재부</option>
              <option value="0">시스템관리</option>
            </select>
          </div>
        </div>
        <button onClick={handleCreateUser} className="w-full bg-black text-white p-4 rounded-xl font-black text-lg hover:bg-blue-700 transition-all active:scale-[0.99] shadow-lg">
          {loading ? '데이터 처리 중...' : '직원 등록 및 권한 활성화'}
        </button>
      </section>

      {/* 2. 직원 목록 및 권한 수정 테이블 */}
      <section className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b-2 border-gray-50 bg-gray-50/50">
          <h2 className="text-lg font-bold">전체 직원 권한 현황</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 font-black text-[11px] uppercase tracking-widest border-b">
                <th className="p-6 text-left">직원 정보 / 부서</th>
                <th className="p-4 text-center">기준정보</th>
                <th className="p-4 text-center">영업/구매</th>
                <th className="p-4 text-center">품질(QC)</th>
                <th className="p-4 text-center">생산/BOM</th>
                <th className="p-4 text-center">시스템관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-gray-900 text-base">{user.user_name}</div>
                    <div className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block mt-1 mb-1 ${user.dept_id === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {getDeptName(user.dept_id)}
                    </div>
                    <div className="text-xs text-gray-400">{user.email}</div>
                  </td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_manage_master} onChange={() => togglePermission(user.id, 'can_manage_master', !!user.can_manage_master)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_po_create} onChange={() => togglePermission(user.id, 'can_po_create', !!user.can_po_create)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_qc_manage} onChange={() => togglePermission(user.id, 'can_qc_manage', !!user.can_qc_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_production_manage} onChange={() => togglePermission(user.id, 'can_production_manage', !!user.can_production_manage)} className="w-5 h-5 accent-black cursor-pointer" /></td>
                  <td className="p-4 text-center"><input type="checkbox" checked={!!user.can_manage_permissions} onChange={() => togglePermission(user.id, 'can_manage_permissions', !!user.can_manage_permissions)} className="w-5 h-5 accent-blue-600 cursor-pointer" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}