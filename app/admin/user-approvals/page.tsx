'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import SearchableCombobox from '@/components/SearchableCombobox';
import {
  getDefaultPerms,
  getStaffDepartmentValues,
  getStaffRankValues,
  STAFF_DEPARTMENTS,
  STAFF_RANKS,
} from '@/lib/staff-profile-options';

const ALLOWED_USER_KINDS = ['student', 'teacher', 'staff'] as const;
const PAGE_SIZE = 25;
type UserKind = (typeof ALLOWED_USER_KINDS)[number];
type PermissionKey =
  | 'can_manage_master'
  | 'can_sales_manage'
  | 'can_material_manage'
  | 'can_production_manage'
  | 'can_qc_manage'
  | 'can_admin_manage'
  | 'can_manage_permissions'
  | 'can_approval_participate';
type PermissionForm = Record<PermissionKey, boolean>;
type Warehouse = { id: number; code: string | null; name: string };
type NewUserForm = {
  user_name: string;
  email: string;
  password: string;
  phone: string;
  user_kind: '' | UserKind;
  training_program: string;
  school_name: string;
  grade_level: string;
  major: string;
  teacher_subject: string;
  department: string;
  job_rank: string;
  warehouse_ids: number[];
  permissions: PermissionForm;
};

const USER_KIND_LABELS: Record<UserKind, string> = {
  student: '학생',
  teacher: '교사',
  staff: '직원',
};

const USER_KIND_COLUMN_ALIASES: Record<string, UserKind> = {
  student: 'student',
  학생: 'student',
  teacher: 'teacher',
  선생: 'teacher',
  교사: 'teacher',
  staff: 'staff',
  직원: 'staff',
};

const PERMISSION_FIELDS: { key: PermissionKey; label: string; disabled?: boolean }[] = [
  { key: 'can_manage_master', label: '기준정보' },
  { key: 'can_sales_manage', label: '영업/구매' },
  { key: 'can_material_manage', label: '자재/재고' },
  { key: 'can_production_manage', label: '생산/BOM' },
  { key: 'can_qc_manage', label: '품질(QC)' },
  { key: 'can_admin_manage', label: '경영/관리 (미사용)', disabled: true },
  { key: 'can_manage_permissions', label: '시스템관리' },
  { key: 'can_approval_participate', label: '결재권권한' },
];

const EMPTY_PERMISSIONS: PermissionForm = {
  can_manage_master: false,
  can_sales_manage: false,
  can_material_manage: false,
  can_production_manage: false,
  can_qc_manage: false,
  can_admin_manage: false,
  can_manage_permissions: false,
  can_approval_participate: true,
};

const EMPTY_NEW_USER_FORM: NewUserForm = {
  user_name: '',
  email: '',
  password: '',
  phone: '',
  user_kind: '',
  training_program: '',
  school_name: '',
  grade_level: '',
  major: '',
  teacher_subject: '',
  department: '',
  job_rank: '',
  warehouse_ids: [],
  permissions: { ...EMPTY_PERMISSIONS },
};

function parseBooleanCell(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'y', 'yes', 'o', 'on'].includes(normalized);
}

function parseWarehouseIdsFromCodes(raw: unknown, warehouses: Warehouse[]) {
  const codes = String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const ids: number[] = [];
  const unknownCodes: string[] = [];
  for (const code of codes) {
    const byCode = warehouses.find((warehouse) => warehouse.code?.toLowerCase() === code.toLowerCase());
    if (byCode) {
      ids.push(byCode.id);
      continue;
    }
    const fallback = /^wh-(\d{2})$/i.exec(code);
    if (fallback) {
      ids.push(Number(fallback[1]));
      continue;
    }
    unknownCodes.push(code);
  }
  return { ids: Array.from(new Set(ids)), unknownCodes };
}

function formatWarehouseLabel(warehouse: Warehouse): string {
  const normalizedCode = warehouse.code ?? `WH-${String(warehouse.id).padStart(3, '0')}`;
  return `[${normalizedCode}] ${warehouse.name}`.trim();
}

export default function UserApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [newUser, setNewUser] = useState<NewUserForm>({ ...EMPTY_NEW_USER_FORM });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const departmentOptions = STAFF_DEPARTMENTS;
  const rankOptions = STAFF_RANKS;
  const userKindOptions = ALLOWED_USER_KINDS.map((kind) => ({ value: kind, label: USER_KIND_LABELS[kind] }));
  const totalPages = Math.max(1, Math.ceil(pendingUsers.length / PAGE_SIZE));
  const pageUsers = pendingUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const getAuthHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchPendingUsers = async () => {
    const { data } = await supabase.from('app_users').select('*').eq('role_name', 'pending').order('created_at', { ascending: false });
    setPendingUsers(data || []);
    setSelectedIds([]);
  };

  const loadInitialData = async () => {
    setLoading(true);
    const [pendingResult, warehouseResult] = await Promise.all([
      supabase.from('app_users').select('*').eq('role_name', 'pending').order('created_at', { ascending: false }),
      supabase.from('warehouses').select('id, code, name').order('sort_order', { ascending: true }),
    ]);
    setPendingUsers(pendingResult.data || []);
    setWarehouses((warehouseResult.data || []) as Warehouse[]);
    setSelectedIds([]);
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(pendingUsers.map((u) => u.id));
    else setSelectedIds([]);
  };

  const handleSelectUser = (id: string, checked: boolean) => {
    if (checked) setSelectedIds((prev) => [...prev, id]);
    else setSelectedIds((prev) => prev.filter((userId) => userId !== id));
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return alert('승인할 사용자를 선택해주세요.');
    if (!confirm(`선택한 ${selectedIds.length}명의 사용자를 일괄 승인하시겠습니까?`)) return;
    setLoading(true);

    let successCount = 0;
    for (const id of selectedIds) {
      const user = pendingUsers.find((u) => u.id === id);
      if (!user) continue;
      const autoPerms = getDefaultPerms(user.department ?? '');
      const { error } = await supabase.from('app_users').update({ role_name: 'staff', ...autoPerms }).eq('id', id);
      if (!error) successCount += 1;
    }

    alert(`✅ ${successCount}명 승인 완료!`);
    await fetchPendingUsers();
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return alert('삭제할 사용자를 선택해주세요.');
    if (!confirm(`⚠️ 정말로 선택한 ${selectedIds.length}명의 가입을 거절하고 완전히 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/delete-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      const result = await res.json();
      if (res.ok) {
        alert(`🗑️ ${result.count}명 삭제 완료!`);
        await fetchPendingUsers();
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
    if (!newUser.user_kind) return alert('사용자 유형(학생/교사/직원)은 필수입니다.');
    if (newUser.user_kind === 'student' && (!newUser.school_name || !newUser.training_program || !newUser.grade_level || !newUser.major)) {
      return alert('학생은 학교, 교육프로그램, 학년, 전공이 필수입니다.');
    }
    if (newUser.user_kind === 'teacher' && (!newUser.school_name || !newUser.training_program || !newUser.teacher_subject)) {
      return alert('교사는 학교, 교육프로그램, 과목이 필수입니다.');
    }
    if (newUser.user_kind === 'staff' && (!newUser.department || !newUser.job_rank)) {
      return alert('직원은 부서와 직급이 필수입니다.');
    }

    setLoading(true);
    const autoPerms = getDefaultPerms(newUser.department);
    const payloadByKind = {
      ...newUser,
      school_name: newUser.user_kind === 'staff' ? '' : newUser.school_name,
      training_program: newUser.user_kind === 'staff' ? '' : newUser.training_program,
      grade_level: newUser.user_kind === 'student' ? newUser.grade_level : '',
      major: newUser.user_kind === 'student' ? newUser.major : '',
      teacher_subject: newUser.user_kind === 'teacher' ? newUser.teacher_subject : '',
      department: newUser.user_kind === 'staff' ? newUser.department : '',
      job_rank: newUser.user_kind === 'staff' ? newUser.job_rank : '',
      warehouse_ids: newUser.warehouse_ids,
      ...newUser.permissions,
    };

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ ...payloadByKind, role_name: 'pending', ...autoPerms, ...newUser.permissions }),
    });

    if (res.ok) {
      alert('신규 계정이 등록되어 승인 대기 목록에 추가되었습니다!');
      setNewUser({ ...EMPTY_NEW_USER_FORM, permissions: { ...EMPTY_PERMISSIONS } });
      await fetchPendingUsers();
    } else {
      const err = await res.json();
      alert('등록 에러: ' + err.error);
    }
    setLoading(false);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        이름: '홍길동',
        이메일: 'hong@biogtp.com',
        초기비밀번호: '12341234',
        연락처: '010-1234-5678',
        사용자유형: 'staff',
        학교: '',
        교육프로그램: '',
        학년: '',
        전공: '',
        과목: '',
        부서: '영업',
        직급: '사원',
        창고코드: 'WH-01,WH-02',
        권한_기준정보: 'N',
        권한_영업구매: 'Y',
        권한_자재재고: 'N',
        권한_생산BOM: 'N',
        권한_품질QC: 'N',
        권한_경영관리: 'N',
        권한_시스템관리: 'N',
        권한_결재권권한: 'Y',
      },
      {
        이름: '김학생',
        이메일: 'student@school.com',
        초기비밀번호: '12341234',
        연락처: '010-0000-0000',
        사용자유형: 'student',
        학교: 'OO고등학교',
        교육프로그램: '인턴십',
        학년: '2학년',
        전공: '기계',
        과목: '',
        부서: '',
        직급: '',
        창고코드: 'WH-03',
        권한_기준정보: 'N',
        권한_영업구매: 'N',
        권한_자재재고: 'N',
        권한_생산BOM: 'N',
        권한_품질QC: 'N',
        권한_경영관리: 'N',
        권한_시스템관리: 'N',
        권한_결재권권한: 'Y',
      },
      {
        이름: '필독!',
        이메일: '사용자유형: student/teacher/staff (또는 학생/교사/직원)',
        초기비밀번호: '필수',
        연락처: '권장',
        사용자유형: '',
        학교: '선택',
        교육프로그램: '선택',
        학년: '선택',
        전공: '선택',
        과목: '선택',
        부서: `선택 (예시: ${getStaffDepartmentValues().join('/')})`,
        직급: `선택 (예시: ${getStaffRankValues().join('/')})`,
        창고코드: 'WH-01~WH-20 형식, 복수는 쉼표',
        권한_기준정보: 'Y/N',
        권한_영업구매: 'Y/N',
        권한_자재재고: 'Y/N',
        권한_생산BOM: 'Y/N',
        권한_품질QC: 'Y/N',
        권한_경영관리: 'Y/N',
        권한_시스템관리: 'Y/N',
        권한_결재권권한: 'Y/N (미입력 시 Y)',
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '양식');
    XLSX.writeFile(workbook, 'BIO_ERP_사용자등록_템플릿.xlsx');
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
      if (jsonData.length === 0) throw new Error('엑셀 파일에 데이터가 없습니다.');

      for (const row of jsonData) {
        const name = row['이름'];
        if (name === '필독!') continue;
        const rawKind = row['사용자유형']?.toString().trim().toLowerCase();
        const userKind = rawKind ? USER_KIND_COLUMN_ALIASES[rawKind] : undefined;
        if (!userKind) {
          alert(`❌ 업로드 중단!\n\n[${name}]님의 사용자유형 값이 비어있거나 올바르지 않습니다.`);
          setLoading(false);
          return;
        }

        const { unknownCodes } = parseWarehouseIdsFromCodes(row['창고코드'], warehouses);
        if (unknownCodes.length > 0) {
          alert(`❌ 업로드 중단!\n\n[${name}]님의 창고코드(${unknownCodes.join(', ')})를 확인해주세요.`);
          setLoading(false);
          return;
        }
      }

      if (!confirm(`검증 완료! 총 ${jsonData.filter((r) => r['이름'] !== '필독!').length}명을 승인 대기 목록에 등록하시겠습니까?`)) {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let successCount = 0;
      for (const row of jsonData) {
        if (row['이름'] === '필독!') continue;
        const rawKind = row['사용자유형']?.toString().trim().toLowerCase();
        const userKind = rawKind ? USER_KIND_COLUMN_ALIASES[rawKind] : undefined;
        if (!userKind) continue;

        const dept = row['부서']?.toString().trim() || '';
        const autoPerms = getDefaultPerms(dept);
        const { ids: warehouseIds } = parseWarehouseIdsFromCodes(row['창고코드'], warehouses);
        const payload = {
          user_name: row['이름'],
          email: row['이메일'],
          password: row['초기비밀번호']?.toString() || 'biogtp123!',
          phone: row['연락처']?.toString() || '-',
          user_kind: userKind,
          school_name: userKind === 'staff' ? '' : row['학교']?.toString().trim() || '',
          training_program: userKind === 'staff' ? '' : row['교육프로그램']?.toString().trim() || '',
          grade_level: userKind === 'student' ? row['학년']?.toString().trim() || '' : '',
          major: userKind === 'student' ? row['전공']?.toString().trim() || '' : '',
          teacher_subject: userKind === 'teacher' ? row['과목']?.toString().trim() || '' : '',
          department: userKind === 'staff' ? dept : '',
          job_rank: userKind === 'staff' ? row['직급']?.toString().trim() || '' : '',
          warehouse_ids: warehouseIds,
          role_name: 'pending',
          ...autoPerms,
          can_manage_master: parseBooleanCell(row['권한_기준정보']),
          can_sales_manage: parseBooleanCell(row['권한_영업구매']),
          can_material_manage: parseBooleanCell(row['권한_자재재고']),
          can_production_manage: parseBooleanCell(row['권한_생산BOM']),
          can_qc_manage: parseBooleanCell(row['권한_품질QC']),
          can_admin_manage: false,
          can_manage_permissions: parseBooleanCell(row['권한_시스템관리']),
          can_approval_participate:
            row['권한_결재권권한'] === undefined
              ? row['권한_결재참여'] === undefined
                ? true
                : parseBooleanCell(row['권한_결재참여'])
              : parseBooleanCell(row['권한_결재권권한']),
        };

        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.ok) successCount += 1;
      }

      alert(`✅ 승인 대기 목록 등록 완료 (${successCount}건)`);
      await fetchPendingUsers();
    } catch (error: any) {
      alert('에러: ' + error.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto font-sans bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-black uppercase text-blue-600 italic">
          Registration <span className="text-black">Approval</span>
        </h1>
        <p className="text-gray-500 text-[10px] font-bold">신규 사용자 가입 승인 및 엑셀 일괄 등록</p>
      </header>

      <section className="bg-white border-2 border-black p-6 rounded-2xl mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-black flex items-center gap-2">
            <span className="w-1.5 h-5 bg-blue-600 rounded-full"></span>관리자 직접 사용자 등록
          </h2>
          <div className="flex gap-2">
            <button
              disabled={loading}
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-black hover:bg-gray-200 flex items-center gap-1 disabled:opacity-50"
            >
              템플릿 다운로드
            </button>
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleExcelUpload} />
            <button
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-black hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
            >
              엑셀 일괄 등록
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 font-bold text-xs">
          <div className="col-span-2 lg:col-span-1 space-y-1">
            <label className="text-[9px] font-black text-gray-400">이름</label>
            <input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.user_name} onChange={(e) => setNewUser({ ...newUser, user_name: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-[9px] font-black text-gray-400">이메일 ID</label>
            <input type="email" className="w-full p-2.5 border-2 rounded-lg" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
          </div>
          <div className="col-span-2 lg:col-span-1 space-y-1">
            <label className="text-[9px] font-black text-gray-400">비밀번호</label>
            <input type="password" className="w-full p-2.5 border-2 rounded-lg" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          </div>
          <div className="col-span-2 lg:col-span-1 space-y-1">
            <label className="text-[9px] font-black text-gray-400">연락처</label>
            <input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
          </div>
          <div className="col-span-1 space-y-1">
            <label className="text-[9px] font-black text-gray-400">사용자 유형 *</label>
            <SearchableCombobox
              value={newUser.user_kind}
              onChange={(v) => setNewUser({ ...newUser, user_kind: v as NewUserForm['user_kind'] })}
              options={userKindOptions}
              placeholder="선택"
            />
          </div>
          {newUser.user_kind === 'student' && (
            <>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">학교 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.school_name} onChange={(e) => setNewUser({ ...newUser, school_name: e.target.value })} /></div>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">교육프로그램 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.training_program} onChange={(e) => setNewUser({ ...newUser, training_program: e.target.value })} /></div>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">학년 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.grade_level} onChange={(e) => setNewUser({ ...newUser, grade_level: e.target.value })} /></div>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">전공 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.major} onChange={(e) => setNewUser({ ...newUser, major: e.target.value })} /></div>
            </>
          )}
          {newUser.user_kind === 'teacher' && (
            <>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">학교 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.school_name} onChange={(e) => setNewUser({ ...newUser, school_name: e.target.value })} /></div>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">교육프로그램 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.training_program} onChange={(e) => setNewUser({ ...newUser, training_program: e.target.value })} /></div>
              <div className="col-span-1 space-y-1"><label className="text-[9px] font-black text-gray-400">과목 *</label><input type="text" className="w-full p-2.5 border-2 rounded-lg" value={newUser.teacher_subject} onChange={(e) => setNewUser({ ...newUser, teacher_subject: e.target.value })} /></div>
            </>
          )}
          {newUser.user_kind === 'staff' && (
            <>
              <div className="col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400">부서 *</label>
                <SearchableCombobox value={newUser.department} onChange={(v) => setNewUser({ ...newUser, department: v })} options={departmentOptions} placeholder="선택" />
              </div>
              <div className="col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400">직급 *</label>
                <SearchableCombobox value={newUser.job_rank} onChange={(v) => setNewUser({ ...newUser, job_rank: v })} options={rankOptions} placeholder="선택" />
              </div>
            </>
          )}
          <div className="col-span-2 lg:col-span-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-[10px] font-black text-gray-500">창고 권한</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {warehouses.map((warehouse) => (
                <label key={warehouse.id} className="flex items-center gap-2 rounded bg-white px-2 py-1">
                  <input
                    type="checkbox"
                    checked={newUser.warehouse_ids.includes(warehouse.id)}
                    onChange={(e) =>
                      setNewUser((prev) => ({
                        ...prev,
                        warehouse_ids: e.target.checked
                          ? Array.from(new Set([...prev.warehouse_ids, warehouse.id]))
                          : prev.warehouse_ids.filter((id) => id !== warehouse.id),
                      }))
                    }
                  />
                  <span>{formatWarehouseLabel(warehouse)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 lg:col-span-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-[10px] font-black text-gray-500">권한</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {PERMISSION_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-2 rounded bg-white px-2 py-1">
                  <input
                    type="checkbox"
                    checked={newUser.permissions[field.key]}
                    disabled={field.disabled}
                    onChange={(e) =>
                      setNewUser((prev) => ({
                        ...prev,
                        permissions: { ...prev.permissions, [field.key]: e.target.checked },
                      }))
                    }
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <button disabled={loading} onClick={handleCreateUser} className="w-full bg-black text-white p-3 rounded-xl font-black text-sm hover:bg-gray-800 disabled:opacity-50">사용자 등록 및 승인대기목록 추가</button>
      </section>

      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden flex-grow flex flex-col">
        <div className="p-4 border-b-2 bg-orange-50 flex justify-between items-center">
          <h2 className="text-sm font-black text-orange-800">가입 승인 대기 목록 ({pendingUsers.length}명)</h2>
          <div className="flex gap-2">
            <button disabled={loading} onClick={handleBulkDelete} className="px-4 py-2 bg-white border-2 border-red-200 text-red-500 rounded-lg text-xs font-black shadow-sm hover:bg-red-50 active:scale-95 transition-all disabled:opacity-50">일괄 삭제</button>
            <button disabled={loading} onClick={handleBulkApprove} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-xs font-black shadow-md hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50">일괄 승인</button>
          </div>
        </div>
        <div className="overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b-2 sticky top-0 z-10">
              <tr>
                <th className="p-4 text-center w-12"><input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" checked={pendingUsers.length > 0 && selectedIds.length === pendingUsers.length} onChange={(e) => handleSelectAll(e.target.checked)} /></th>
                <th className="p-4 font-black text-[10px] text-gray-400">사용자 정보</th>
                <th className="p-4 font-black text-[10px] text-gray-400">연락처</th>
                <th className="p-4 font-black text-[10px] text-gray-400">분류</th>
                <th className="p-4 font-black text-[10px] text-gray-400">가입일시</th>
              </tr>
            </thead>
            <tbody className="divide-y-2">
              {pendingUsers.length === 0 ? (
                <tr><td colSpan={5} className="p-10 text-center text-gray-400 font-bold">승인 대기 중인 사용자가 없습니다.</td></tr>
              ) : (
                pageUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-orange-50/30">
                    <td className="p-4 text-center"><input type="checkbox" className="w-5 h-5 accent-orange-500 cursor-pointer" checked={selectedIds.includes(user.id)} onChange={(e) => handleSelectUser(user.id, e.target.checked)} /></td>
                    <td className="p-4">
                      <div className="font-black text-sm">{user.user_name}</div>
                      <div className="text-gray-500 font-bold">{user.email}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-indigo-600">사번: {user.employee_no ?? '-'}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{USER_KIND_LABELS[(user.user_kind as UserKind) ?? 'staff'] ?? '직원'}</div>
                    </td>
                    <td className="p-4 font-bold text-gray-600">{user.phone}</td>
                    <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded font-black">{user.department || user.school_name || '-'}</span> {user.job_rank || user.training_program || ''}</td>
                    <td className="p-4 text-gray-400 font-bold">{new Date(user.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t bg-orange-50 px-4 py-2 text-xs font-bold text-orange-900">
          <p>페이지 {currentPage} / {totalPages} (페이지당 {PAGE_SIZE}명)</p>
          <div className="flex gap-1">
            <button type="button" className="rounded border border-orange-200 bg-white px-2 py-1 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>처음</button>
            <button type="button" className="rounded border border-orange-200 bg-white px-2 py-1 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>이전</button>
            <button type="button" className="rounded border border-orange-200 bg-white px-2 py-1 disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>다음</button>
            <button type="button" className="rounded border border-orange-200 bg-white px-2 py-1 disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>마지막</button>
          </div>
        </div>
      </section>
    </div>
  );
}