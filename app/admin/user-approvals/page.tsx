'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

const VALID_DEPARTMENTS = ['영업', '자재', '생산', '구매', 'QC', '경영지원', '관리'];
const VALID_RANKS = ['사원', '대리', '과장', '차장', '부장', '이사', '대표'];

const getDefaultPerms = (dept: string) => ({
  can_manage_master: dept === '관리' || dept === '경영지원',
  can_po_create: dept === '영업' || dept === '구매',
  can_material_manage: dept === '자재',
  can_production_manage: dept === '생산',
  can_qc_manage: dept === 'QC',
  can_admin_manage: dept === '관리' || dept === '경영지원',
  can_manage_permissions: false
});

export default function UserApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({ 
    user_name: '', email: '', password: '', phone: '', department: '', job_rank: '' 
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPendingUsers(); }, []);

  const fetchPendingUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_users').select('*').eq('role_name', 'pending').order('created_at', { ascending: false });
    setPendingUsers(data || []);
    setSelectedIds([]);
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(pendingUsers.map(u => u.id));
    else setSelectedIds([]);
  };

  const handleSelectUser = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(userId => userId !== id));
  };

  // ✅ 일괄 승인 함수
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return alert('승인할 직원을 선택해주세요.');
    if (!confirm(`선택한 ${selectedIds.length}명의 직원을 일괄 승인하시겠습니까?`)) return;

    setLoading(true);
    let successCount = 0;

    for (const id of selectedIds) {
      const user = pendingUsers.find(u => u.id === id);
      if (user) {
        const autoPerms = getDefaultPerms(user.department);
        const { error } = await supabase.from('app_users').update({ 
          role_name: 'staff', 
          ...autoPerms 
        }).eq('id', id);
        
        if (!error) successCount++;
      }
    }
    
    alert(`✅ ${successCount}명 승인 완료!`);
    fetchPendingUsers();
  };

  // 🗑️ 일괄 삭제 함수 (새로 추가됨!)
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return alert('삭제할 직원을 선택해주세요.');
    if (!confirm(`⚠️ 정말로 선택한 ${selectedIds.length}명의 가입을 거절하고 완전히 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/delete-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedIds })
      });

      const result = await res.json();
      if (res.ok) {
        alert(`🗑️ ${result.count}명 삭제 완료!`);
        fetchPendingUsers();
      } else {
        alert('삭제 에러: ' + result.error);
      }
    } catch (e: any) {
      alert('삭제 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.user_name) {
      return alert('이름, 이메일, 비밀번호는 필수 입력입니다.');
    }
    setLoading(true);
    
    const autoPerms = getDefaultPerms(newUser.department);
    
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, role_name: 'pending', ...autoPerms })
    });
    
    if (res.ok) {
      alert('신규 계정이 등록되어 승인 대기 목록에 추가되었습니다!');
      setNewUser({ user_name: '', email: '', password: '', phone: '', department: '', job_rank: '' });
      fetchPendingUsers();
    } else {
      const err = await res.json();
      alert('등록 에러: ' + err.error);
    }
    setLoading(false);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      { 이름: '홍길동', 이메일: 'hong@biogtp.com', 초기비밀번호: '12341234', 연락처: '010-1234-5678', 부서: '영업', 직급: '사원' },
      { 이름: '필독!', 이메일: '사용가능부서:', 초기비밀번호: VALID_DEPARTMENTS.join('/'), 연락처: '사용가능직급:', 부서: VALID_RANKS.join('/'), 직급: '오타주의' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '양식');
    XLSX.writeFile(workbook, 'BIO_ERP_직원등록_템플릿.xlsx');
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
      
      if (jsonData.length === 0) throw new Error("엑셀 파일에 데이터가 없습니다.");

      for (const row of jsonData) {
        const name = row['이름'];
        if (name === '필독!') continue; 

        const dept = row['부서']?.toString().trim() || '미지정';
        const rank = row['직급']?.toString().trim() || '사원';

        if (dept !== '미지정' && !VALID_DEPARTMENTS.includes(dept)) {
          alert(`❌ 업로드 중단!\n\n[${name}]님의 부서명('${dept}')이 올바르지 않습니다.\n\n사용 가능 부서:\n${VALID_DEPARTMENTS.join(', ')}`);
          setLoading(false);
          return;
        }

        if (rank !== '사원' && !VALID_RANKS.includes(rank)) {
          alert(`❌ 업로드 중단!\n\n[${name}]님의 직급명('${rank}')이 올바르지 않습니다.\n\n사용 가능 직급:\n${VALID_RANKS.join(', ')}`);
          setLoading(false);
          return;
        }
      }

      if (!confirm(`검역 통과! 총 ${jsonData.filter(r=>r['이름']!=='필독!').length}명의 직원을 '승인 대기 목록'에 등록하시겠습니까?`)) {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let successCount = 0;
      for (const row of jsonData) {
        if (row['이름'] === '필독!') continue;
        const dept = row['부서']?.toString().trim() || '미지정';
        const autoPerms = getDefaultPerms(dept);
        
        const payload = {
          user_name: row['이름'],
          email: row['이메일'],
          password: row['초기비밀번호']?.toString() || 'biogtp123!',
          phone: row['연락처']?.toString() || '-',
          department: dept,
          job_rank: row['직급']?.toString().trim() || '사원',
          role_name: 'pending',
          ...autoPerms
        };

        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) successCount++;
      }

      alert(`✅ 승인 대기 목록 등록 완료 (${successCount}건)`);
      fetchPendingUsers();
    } catch (error: any) {
      alert("에러: " + error.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto font-sans bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-black uppercase text-blue-600 italic">Registration <span className="text-black">Approval</span></h1>
        <p className="text-gray-500 text-[10px] font-bold">신규 직원 가입 승인 및 엑셀 일괄 등록</p>
      </header>

      <section className="bg-white border-2 border-black p-6 rounded-2xl mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-black flex items-center gap-2"><span className="w-1.5 h-5 bg-blue-600 rounded-full"></span>관리자 직접 직원 등록</h2>
          <div className="flex gap-2">
            <button onClick={handleDownloadTemplate} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-black hover:bg-gray-200 flex items-center gap-1">📥 템플릿 다운로드</button>
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleExcelUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-black hover:bg-green-700 flex items-center gap-1">📗 엑셀 일괄 등록</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4 font-bold text-xs">
           <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">이름</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.user_name} onChange={e => setNewUser({...newUser, user_name: e.target.value})} /></div>
           <div className="col-span-2 space-y-1"><label className="text-[9px] font-black text-gray-400">이메일 ID</label><input type="email" className="w-full p-2.5 border-2 rounded-lg" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
           <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">비밀번호</label><input type="password" placeholder="8자 이상" className="w-full p-2.5 border-2 rounded-lg" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
           <div className="col-span-2 lg:col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">연락처</label><input type="text" placeholder="010-0000-0000" className="w-full p-2.5 border-2 rounded-lg" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} /></div>
           <div className="col-span-2 lg:col-span-1 space-y-1">
             <label className="text-[9px] font-black text-gray-400">부서</label>
             <select className="w-full p-2.5 border-2 rounded-lg bg-white" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})}>
               <option value="">선택</option>{VALID_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
             </select>
           </div>
           <div className="col-span-2 lg:col-span-1 space-y-1">
             <label className="text-[9px] font-black text-gray-400">직급</label>
             <select className="w-full p-2.5 border-2 rounded-lg bg-white" value={newUser.job_rank} onChange={e => setNewUser({...newUser, job_rank: e.target.value})}>
               <option value="">선택</option>{VALID_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
             </select>
           </div>
        </div>
        <button onClick={handleCreateUser} className="w-full bg-black text-white p-3 rounded-xl font-black text-sm hover:bg-gray-800">직원 등록 및 승인대기목록 추가</button>
      </section>

      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden flex-grow flex flex-col">
        <div className="p-4 border-b-2 bg-orange-50 flex justify-between items-center">
          <h2 className="text-sm font-black text-orange-800">🚨 가입 승인 대기 목록 ({pendingUsers.length}명)</h2>
          
          {/* 🌟 휴지통 버튼과 승인 버튼 나란히 배치 */}
          <div className="flex gap-2">
            <button 
              onClick={handleBulkDelete} 
              className="px-4 py-2 bg-white border-2 border-red-200 text-red-500 rounded-lg text-xs font-black shadow-sm hover:bg-red-50 active:scale-95 transition-all"
            >
              🗑️ 일괄 삭제
            </button>
            <button 
              onClick={handleBulkApprove} 
              className="px-5 py-2 bg-orange-600 text-white rounded-lg text-xs font-black shadow-md hover:bg-orange-700 active:scale-95 transition-all"
            >
              ✅ 일괄 승인
            </button>
          </div>

        </div>
        <div className="overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b-2 sticky top-0 z-10">
              <tr>
                <th className="p-4 text-center w-12"><input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" checked={pendingUsers.length > 0 && selectedIds.length === pendingUsers.length} onChange={(e) => handleSelectAll(e.target.checked)} /></th>
                <th className="p-4 font-black text-[10px] text-gray-400">직원 정보</th>
                <th className="p-4 font-black text-[10px] text-gray-400">연락처</th>
                <th className="p-4 font-black text-[10px] text-gray-400">부서/직급</th>
                <th className="p-4 font-black text-[10px] text-gray-400">가입일시</th>
              </tr>
            </thead>
            <tbody className="divide-y-2">
              {pendingUsers.length === 0 ? (
                <tr><td colSpan={5} className="p-10 text-center text-gray-400 font-bold">승인 대기 중인 직원이 없습니다.</td></tr>
              ) : (
                pendingUsers.map(user => (
                  <tr key={user.id} className="hover:bg-orange-50/30">
                    <td className="p-4 text-center"><input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" checked={selectedIds.includes(user.id)} onChange={(e) => handleSelectUser(user.id, e.target.checked)} /></td>
                    <td className="p-4"><div className="font-black text-sm">{user.user_name}</div><div className="text-gray-500 font-bold">{user.email}</div></td>
                    <td className="p-4 font-bold text-gray-600">{user.phone}</td>
                    <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded font-black">{user.department}</span> {user.job_rank}</td>
                    <td className="p-4 text-gray-400 font-bold">{new Date(user.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}