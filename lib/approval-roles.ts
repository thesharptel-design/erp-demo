export const APPROVAL_ROLES = [
  'pre_cooperator',
  'approver',
  'post_cooperator',
  'reference',
] as const

export type ApprovalRole = (typeof APPROVAL_ROLES)[number]

const ROLE_ORDER: Record<ApprovalRole, number> = {
  pre_cooperator: 1,
  approver: 2,
  post_cooperator: 3,
  reference: 4,
}

const ROLE_LABEL: Record<ApprovalRole, string> = {
  pre_cooperator: '협조',
  approver: '결재',
  post_cooperator: '협조',
  reference: '참조',
}

export function normalizeApprovalRole(input: string | null | undefined): ApprovalRole | null {
  const role = String(input ?? '').trim().toLowerCase()
  if (APPROVAL_ROLES.includes(role as ApprovalRole)) return role as ApprovalRole
  if (role === 'review' || role === 'reviewer') return 'reference'
  if (role === 'approve' || role === 'final_approver') return 'approver'
  if (role === 'cooperator') return 'pre_cooperator'
  return null
}

export function getApprovalRoleOrder(role: string | null | undefined): number {
  const normalized = normalizeApprovalRole(role)
  if (!normalized) return Number.MAX_SAFE_INTEGER
  return ROLE_ORDER[normalized]
}

export function getApprovalRoleLabel(role: string | null | undefined): string {
  const normalized = normalizeApprovalRole(role)
  if (!normalized) return String(role ?? '')
  return ROLE_LABEL[normalized]
}

export function isApprovalActionRole(role: string | null | undefined): boolean {
  const normalized = normalizeApprovalRole(role)
  return normalized === 'pre_cooperator' || normalized === 'approver' || normalized === 'post_cooperator'
}

export function isFinalApprovalRole(role: string | null | undefined): boolean {
  return normalizeApprovalRole(role) === 'approver'
}

export function isPreCooperatorRole(role: string | null | undefined): boolean {
  return normalizeApprovalRole(role) === 'pre_cooperator'
}

export function isPostCooperatorRole(role: string | null | undefined): boolean {
  return normalizeApprovalRole(role) === 'post_cooperator'
}

export function isReferenceRole(role: string | null | undefined): boolean {
  return normalizeApprovalRole(role) === 'reference'
}
