/**
 * 직원(staff) 부서·직급 선택지와 부서별 기본 권한.
 * 가입·승인·권한 화면에서 동일 소스를 사용한다.
 */

export type StaffDepartmentOption = { value: string; label: string }
export type StaffRankOption = { value: string; label: string }

export const STAFF_DEPARTMENTS: StaffDepartmentOption[] = [
  { value: '영업', label: '영업팀' },
  { value: '자재', label: '자재팀' },
  { value: '여과', label: '여과팀' },
  { value: '생산', label: '생산팀' },
  { value: '구매', label: '구매팀' },
  { value: '품질', label: '품질' },
  { value: '품질팀', label: '품질팀' },
  { value: 'QC', label: 'QC' },
  { value: '경영지원', label: '경영지원팀' },
  { value: '관리', label: '관리팀' },
]

export const STAFF_RANKS: StaffRankOption[] = [
  { value: '사원', label: '사원' },
  { value: '조교', label: '조교' },
  { value: '대리', label: '대리' },
  { value: '과장', label: '과장' },
  { value: '차장', label: '차장' },
  { value: '부장', label: '부장' },
  { value: '이사', label: '이사' },
  { value: '대표', label: '대표' },
]

export function getStaffDepartmentValues(): string[] {
  return STAFF_DEPARTMENTS.map((d) => d.value)
}

export function getStaffRankValues(): string[] {
  return STAFF_RANKS.map((r) => r.value)
}

/** 부서 코드에 따른 기본 업무 권한(직급과 무관). 승인/가입 시 스프레드에 사용. */
export function getDefaultPerms(dept: string) {
  const d = String(dept ?? '').trim()
  const isSales = ['영업', '구매', '영업팀', '구매팀'].includes(d)
  const isMaterial = ['자재', '자재팀', '여과', '여과팀'].includes(d)
  const isProduction = ['생산', '생산팀'].includes(d)
  const isQc = ['품질', '품질팀', 'QC', 'QC팀', '품질관리부'].includes(d)

  return {
    can_manage_master: false,
    can_sales_manage: isSales,
    can_material_manage: isMaterial,
    can_production_manage: isProduction,
    can_qc_manage: isQc,
    can_admin_manage: false,
    can_po_create: isSales,
    can_quote_create: ['영업', '영업팀'].includes(d),
    can_receive_stock: isMaterial,
    can_prod_complete: isProduction,
    can_approve: isQc,
    can_manage_permissions: false,
  }
}
