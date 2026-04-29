'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import SearchableCombobox from '@/components/SearchableCombobox';
import { supabase } from '@/lib/supabase';
import { STAFF_DEPARTMENTS, STAFF_RANKS } from '@/lib/staff-profile-options';

type UserKind = 'student' | 'teacher' | 'staff';

type AppUser = {
  id: string;
  employee_no: string | null;
  user_name: string | null;
  email: string | null;
  phone: string | null;
  role_name: string | null;
  user_kind: UserKind;
  department: string | null;
  job_rank: string | null;
  school_name: string | null;
  training_program: string | null;
  grade_level: string | null;
  major: string | null;
  teacher_subject: string | null;
  seal_image_path: string | null;
  is_active: boolean | null;
};

type EditForm = {
  id: string;
  user_name: string;
  email: string;
  phone: string;
  role_name: string;
  user_kind: UserKind;
  department: string;
  job_rank: string;
  school_name: string;
  training_program: string;
  grade_level: string;
  major: string;
  teacher_subject: string;
  seal_image_path: string;
  new_password: string;
};

const PAGE_SIZE = 25;

const USER_KIND_OPTIONS: { value: UserKind; label: string }[] = [
  { value: 'staff', label: '직원' },
  { value: 'teacher', label: '교사' },
  { value: 'student', label: '학생' },
];
const EMPTY_EDIT_FORM: EditForm = {
  id: '',
  user_name: '',
  email: '',
  phone: '',
  role_name: 'staff',
  user_kind: 'staff',
  department: '',
  job_rank: '',
  school_name: '',
  training_program: '',
  grade_level: '',
  major: '',
  teacher_subject: '',
  seal_image_path: '',
  new_password: '',
};

function parseUserKind(value: unknown): UserKind {
  if (value === 'student' || value === 'teacher' || value === 'staff') return value;
  return 'staff';
}

function getUserKindLabel(kind: UserKind): string {
  if (kind === 'student') return '학생';
  if (kind === 'teacher') return '교사';
  return '직원';
}

function normalizeString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function compareUsersForDisplay(a: AppUser, b: AppUser): number {
  const aActive = a.is_active === true ? 1 : 0;
  const bActive = b.is_active === true ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;

  const aName = String(a.user_name ?? '').trim();
  const bName = String(b.user_name ?? '').trim();
  const byName = aName.localeCompare(bName, 'ko');
  if (byName !== 0) return byName;

  const aNo = String(a.employee_no ?? '');
  const bNo = String(b.employee_no ?? '');
  return aNo.localeCompare(bNo, 'ko');
}

function uniqueTextOptions(values: string[]) {
  return Array.from(new Set(values))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((value) => ({ value, label: value }));
}

function getProfileColumns(user: AppUser): { first: { label: string; value: string }; second: { label: string; value: string } } {
  if (user.user_kind === 'student') {
    return {
      first: { label: '학교', value: user.school_name ?? '-' },
      second: { label: '학년/전공', value: [user.grade_level, user.major].filter(Boolean).join(' / ') || '-' },
    };
  }
  if (user.user_kind === 'teacher') {
    return {
      first: { label: '학교', value: user.school_name ?? '-' },
      second: { label: '과목', value: user.teacher_subject ?? '-' },
    };
  }
  return {
    first: { label: '부서', value: user.department ?? '-' },
    second: { label: '직급', value: user.job_rank ?? '-' },
  };
}

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nameFilterUserId, setNameFilterUserId] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [trainingProgramFilter, setTrainingProgramFilter] = useState('');
  const [category1Filter, setCategory1Filter] = useState('');
  const [category2Filter, setCategory2Filter] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (nameFilterUserId && user.id !== nameFilterUserId) return false;
      if (kindFilter && user.user_kind !== kindFilter) return false;
      if (emailFilter && (user.email ?? '-') !== emailFilter) return false;
      if (trainingProgramFilter && (user.training_program ?? '-') !== trainingProgramFilter) return false;
      const profile = getProfileColumns(user);
      if (category1Filter && profile.first.value !== category1Filter) return false;
      if (category2Filter && profile.second.value !== category2Filter) return false;
      return true;
    });
  }, [nameFilterUserId, kindFilter, emailFilter, trainingProgramFilter, category1Filter, category2Filter, users]);

  const selectedCountInFilter = useMemo(
    () => filteredUsers.filter((user) => selectedIds.includes(user.id)).length,
    [filteredUsers, selectedIds]
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredUsers]);

  const nameFilterOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: `${user.user_name ?? '(이름 없음)'} (${user.employee_no ?? '-'})`,
        keywords: [user.email ?? '', user.phone ?? '', user.user_kind, getUserKindLabel(user.user_kind)],
      })),
    [users]
  );
  const kindFilterOptions = useMemo(
    () => USER_KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    []
  );
  const emailFilterOptions = useMemo(
    () => uniqueTextOptions(users.map((user) => user.email ?? '-')),
    [users]
  );
  const trainingProgramFilterOptions = useMemo(
    () => uniqueTextOptions(users.map((user) => user.training_program ?? '-')),
    [users]
  );
  const category1FilterOptions = useMemo(
    () => uniqueTextOptions(users.map((user) => getProfileColumns(user).first.value)),
    [users]
  );
  const category2FilterOptions = useMemo(
    () => uniqueTextOptions(users.map((user) => getProfileColumns(user).second.value)),
    [users]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [nameFilterUserId, kindFilter, emailFilter, trainingProgramFilter, category1Filter, category2Filter, users.length]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    void fetchUsersAndWarehouses();
  }, []);

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

  const fetchUsersAndWarehouses = async () => {
    setLoading(true);
    const usersResult = await supabase
      .from('app_users')
      .select(`
        id, employee_no, user_name, email, phone, role_name, user_kind,
        department, job_rank, school_name, training_program, grade_level, major, teacher_subject, seal_image_path,
        is_active
      `)
      .neq('role_name', 'pending')
      .order('user_name', { ascending: true });

    if (usersResult.error) alert(`사용자 조회 실패: ${usersResult.error.message}`);

    const normalizedUsers = ((usersResult.data ?? []).map((row) => ({
      ...row,
      user_kind: parseUserKind(row.user_kind),
    })) as AppUser[]).sort(compareUsersForDisplay);
    setUsers(normalizedUsers);

    setSelectedIds([]);
    setLoading(false);
  };

  const postUserUpdate = async (id: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ id, ...payload }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error ?? '사용자 업데이트 실패');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !filteredUsers.some((user) => user.id === id)));
      return;
    }
    const next = Array.from(new Set([...selectedIds, ...filteredUsers.map((user) => user.id)]));
    setSelectedIds(next);
  };

  const handleSelectUser = (id: string, checked: boolean) => {
    if (checked) setSelectedIds((prev) => [...prev, id]);
    else setSelectedIds((prev) => prev.filter((userId) => userId !== id));
  };

  const handleBulkRetire = async () => {
    if (selectedIds.length === 0) return alert('퇴사 처리할 사용자를 선택해주세요.');
    if (!confirm(`선택한 ${selectedIds.length}명의 사용자를 비활성화하시겠습니까?`)) return;

    setLoading(true);
    let successCount = 0;
    for (const id of selectedIds) {
      const { error } = await supabase.from('app_users').update({ is_active: false }).eq('id', id);
      if (!error) successCount += 1;
    }
    alert(`✅ ${successCount}명 퇴사 처리 완료`);
    await fetchUsersAndWarehouses();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return alert('삭제할 사용자를 선택해주세요.');
    alert('삭제 버튼 활성화 고민중입니다');
  };

  const handleToggleActive = async (user: AppUser) => {
    const nextActive = !Boolean(user.is_active);
    const confirmText = nextActive ? '복직(활성화)' : '퇴사(비활성화)';
    if (!confirm(`${user.user_name ?? '-'} 사용자를 ${confirmText} 하시겠습니까?`)) return;

    const { error } = await supabase.from('app_users').update({ is_active: nextActive }).eq('id', user.id);
    if (error) alert(`상태 변경 실패: ${error.message}`);
    else await fetchUsersAndWarehouses();
  };

  const handleDeleteUser = async (_user: AppUser) => {
    alert('삭제 버튼 활성화 고민중입니다');
  };

  const openEditModal = (user: AppUser) => {
    setEditingUser(user);
    setEditForm({
      id: user.id,
      user_name: user.user_name ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      role_name: user.role_name ?? 'staff',
      user_kind: user.user_kind,
      department: user.department ?? '',
      job_rank: user.job_rank ?? '',
      school_name: user.school_name ?? '',
      training_program: user.training_program ?? '',
      grade_level: user.grade_level ?? '',
      major: user.major ?? '',
      teacher_subject: user.teacher_subject ?? '',
      seal_image_path: user.seal_image_path ?? '',
      new_password: '',
    });
  };

  const handleUpdateUser = async () => {
    if (!editForm.user_name.trim() || !editForm.email.trim()) {
      return alert('이름과 이메일은 필수입니다.');
    }
    if (!confirm(`${editForm.user_name} 사용자의 정보를 저장하시겠습니까?`)) return;

    setIsUpdating(true);
    try {
      await postUserUpdate(editForm.id, {
        user_name: editForm.user_name.trim(),
        email: editForm.email.trim(),
        phone: normalizeString(editForm.phone),
        role_name: normalizeString(editForm.role_name),
        user_kind: editForm.user_kind,
        department: editForm.user_kind === 'staff' ? normalizeString(editForm.department) : null,
        job_rank: editForm.user_kind === 'staff' ? normalizeString(editForm.job_rank) : null,
        school_name: editForm.user_kind !== 'staff' ? normalizeString(editForm.school_name) : null,
        training_program: editForm.user_kind !== 'staff' ? normalizeString(editForm.training_program) : null,
        grade_level: editForm.user_kind === 'student' ? normalizeString(editForm.grade_level) : null,
        major: editForm.user_kind === 'student' ? normalizeString(editForm.major) : null,
        teacher_subject: editForm.user_kind === 'teacher' ? normalizeString(editForm.teacher_subject) : null,
        seal_image_path: normalizeString(editForm.seal_image_path),
        new_password: normalizeString(editForm.new_password),
      });
      alert('사용자 정보가 저장되었습니다.');
      setEditingUser(null);
      setEditForm(EMPTY_EDIT_FORM);
      await fetchUsersAndWarehouses();
    } catch (error) {
      const message = error instanceof Error ? error.message : '사용자 수정 실패';
      alert(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadUsersExcel = () => {
    const rows = users.map((user) => {
      const profile = getProfileColumns(user);
      return {
        사번: user.employee_no ?? '-',
        이름: user.user_name ?? '-',
        이메일: user.email ?? '-',
        연락처: user.phone ?? '-',
        사용자유형: user.user_kind,
        분류1: `${profile.first.label}: ${profile.first.value}`,
        분류2: `${profile.second.label}: ${profile.second.value}`,
        교육프로그램: user.training_program ?? '-',
        역할: user.role_name ?? '-',
        재직상태: user.is_active ? '재직' : '퇴사',
      };
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'users');
    XLSX.writeFile(workbook, `ERP_사용자조회설정_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1760px] flex-col bg-gray-50 p-2.5 font-sans text-black">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black italic text-blue-600">사용자 조회 및 설정</h1>
          <p className="mt-1 text-[11px] font-bold text-gray-500">
            사용자 기본정보 조회 및 계정관리 전용 화면
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/user-access-control"
            className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 transition-all hover:bg-blue-100"
          >
            사용자 권한 관리로 이동
          </Link>
          <button
            disabled={loading}
            onClick={handleDownloadUsersExcel}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            엑셀 다운로드
          </button>
          <button
            disabled={loading}
            onClick={handleBulkRetire}
            className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-black text-white transition-all hover:bg-gray-900 disabled:opacity-50"
          >
            일괄 퇴사
          </button>
          <button
            disabled={loading}
            onClick={handleBulkDelete}
            className="rounded-lg border-2 border-red-200 bg-white px-4 py-2 text-xs font-black text-red-500 transition-all hover:bg-red-50 disabled:opacity-50"
          >
            일괄 삭제
          </button>
        </div>
      </header>

      <section className="mb-2 rounded-xl border border-gray-200 bg-white p-2.5">
        <div className="text-xs font-bold text-gray-500">
          전체 {users.length}명 / 필터 결과 {filteredUsers.length}명 / 선택 {selectedIds.length}명
        </div>
      </section>

      <section className="flex min-h-0 flex-grow flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-lg">
        <div className="custom-scrollbar flex-grow overflow-auto">
          <table className="w-full min-w-[1120px] text-xs">
            <thead className="sticky top-0 z-10 border-b bg-gray-50 text-[10px] font-black uppercase text-gray-500">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && selectedCountInFilter === filteredUsers.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">이름/사번</p>
                  <SearchableCombobox
                    value={nameFilterUserId}
                    onChange={setNameFilterUserId}
                    options={nameFilterOptions}
                    placeholder="검색"
                    className="w-[160px]"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">유형</p>
                  <SearchableCombobox
                    value={kindFilter}
                    onChange={setKindFilter}
                    options={kindFilterOptions}
                    placeholder="검색"
                    className="w-[96px]"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">이메일</p>
                  <SearchableCombobox
                    value={emailFilter}
                    onChange={setEmailFilter}
                    options={emailFilterOptions}
                    placeholder="검색"
                    className="w-[150px]"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">교육프로그램</p>
                  <SearchableCombobox
                    value={trainingProgramFilter}
                    onChange={setTrainingProgramFilter}
                    options={trainingProgramFilterOptions}
                    placeholder="검색"
                    className="w-[120px]"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">분류 1</p>
                  <SearchableCombobox
                    value={category1Filter}
                    onChange={setCategory1Filter}
                    options={category1FilterOptions}
                    placeholder="검색"
                    className="w-[120px]"
                  />
                </th>
                <th className="px-2 py-2 text-left normal-case">
                  <p className="mb-1 text-[10px] font-black text-gray-500">분류 2</p>
                  <SearchableCombobox
                    value={category2Filter}
                    onChange={setCategory2Filter}
                    options={category2FilterOptions}
                    placeholder="검색"
                    className="w-[120px]"
                  />
                </th>
                <th className="px-3 py-3 text-center">계정 관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageUsers.map((user) => {
                const profile = getProfileColumns(user);
                return (
                  <tr key={user.id} className={`align-top hover:bg-blue-50/40 ${!user.is_active ? 'bg-gray-50 opacity-70' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(user.id)}
                        onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-blue-600"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => openEditModal(user)} className="text-left text-sm font-black text-blue-700 hover:underline">
                        {user.user_name ?? '(이름 없음)'}
                      </button>
                      <p className="mt-1 text-[11px] font-semibold text-gray-500">{user.employee_no ?? '-'}</p>
                      {!user.is_active && (
                        <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-600">RETIRED</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
                        {getUserKindLabel(user.user_kind)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-700">
                      <p>{user.email ?? '-'}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{user.phone ?? '-'}</p>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-700">{user.training_program ?? '-'}</td>
                    <td className="px-3 py-3">
                      <span className="mb-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-black text-gray-500">
                        {profile.first.label}
                      </span>
                      <p className="font-bold">{profile.first.value}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="mb-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-black text-gray-500">
                        {profile.second.label}
                      </span>
                      <p className="font-bold">{profile.second.value}</p>
                      {user.training_program ? (
                        <p className="mt-1 text-[11px] text-gray-500">교육프로그램: {user.training_program}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => void handleToggleActive(user)}
                          className={`rounded px-2 py-1 text-[10px] font-black ${
                            user.is_active
                              ? 'border border-gray-300 bg-white text-gray-600 hover:border-red-500 hover:text-red-500'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          {user.is_active ? '퇴사' : '복직'}
                        </button>
                        <button
                          onClick={() => void handleDeleteUser(user)}
                          className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-black text-red-500 hover:bg-red-600 hover:text-white"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">
          <p>
            페이지 {currentPage} / {totalPages} (페이지당 {PAGE_SIZE}명)
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            >
              처음
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            >
              다음
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
            >
              마지막
            </button>
          </div>
        </div>
      </section>

      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-4">
              <h3 className="text-lg font-black">사용자 상세 정보 수정</h3>
              <button onClick={() => setEditingUser(null)} className="text-xl font-bold text-gray-500 hover:text-black">
                &times;
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">이름</label>
                  <input
                    value={editForm.user_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, user_name: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">연락처</label>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">이메일</label>
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-100 bg-yellow-50 p-3 text-sm font-bold outline-none focus:border-black"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">역할(role_name)</label>
                  <input
                    value={editForm.role_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, role_name: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">사용자 유형</label>
                  <SearchableCombobox
                    value={editForm.user_kind}
                    onChange={(value) =>
                      setEditForm((prev) => ({ ...prev, user_kind: parseUserKind(value), department: '', job_rank: '' }))
                    }
                    options={USER_KIND_OPTIONS}
                    placeholder="선택"
                    showClearOption={false}
                  />
                </div>

                {editForm.user_kind === 'staff' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">부서</label>
                      <SearchableCombobox
                        value={editForm.department}
                        onChange={(value) => setEditForm((prev) => ({ ...prev, department: value }))}
                        options={STAFF_DEPARTMENTS}
                        placeholder="선택"
                        creatable
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">직급</label>
                      <SearchableCombobox
                        value={editForm.job_rank}
                        onChange={(value) => setEditForm((prev) => ({ ...prev, job_rank: value }))}
                        options={STAFF_RANKS}
                        placeholder="선택"
                        creatable
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">학교</label>
                      <input
                        value={editForm.school_name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, school_name: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">교육프로그램</label>
                      <input
                        value={editForm.training_program}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, training_program: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                      />
                    </div>
                    {editForm.user_kind === 'student' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">학년</label>
                          <input
                            value={editForm.grade_level}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, grade_level: e.target.value }))}
                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">전공</label>
                          <input
                            value={editForm.major}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, major: e.target.value }))}
                            className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">과목</label>
                        <input
                          value={editForm.teacher_subject}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, teacher_subject: e.target.value }))}
                          className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">도장 이미지 경로</label>
                  <input
                    value={editForm.seal_image_path}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, seal_image_path: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm font-bold outline-none focus:border-black"
                    placeholder="user-seals/... 경로"
                  />
                </div>
              </div>

              <div className="rounded-xl border-2 border-red-100 bg-red-50 p-4">
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-red-600">비밀번호 재설정</label>
                <p className="mb-2 text-xs font-medium text-red-400">
                  입력 시 기존 비밀번호가 덮어써집니다. 변경하지 않으려면 비워두세요.
                </p>
                <input
                  value={editForm.new_password}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  className="w-full rounded-lg border-2 border-red-200 p-3 text-sm font-bold outline-none focus:border-red-500"
                  placeholder="새 비밀번호"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t bg-gray-50 p-4">
              <button onClick={() => setEditingUser(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200">
                취소
              </button>
              <button
                onClick={() => void handleUpdateUser()}
                disabled={isUpdating}
                className="rounded-xl bg-black px-5 py-2 text-sm font-black text-white hover:bg-blue-600 disabled:bg-gray-400"
              >
                {isUpdating ? '저장 중...' : '변경사항 저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}