export const APPROVAL_ROLES = [
  'reviewer',
  'cooperator',
  'approver',
] as const

export type ApprovalRole = (typeof APPROVAL_ROLES)[number]

const ROLE_ORDER: Record<ApprovalRole, number> = {
  reviewer: 1,
  cooperator: 2,
  approver: 3,
}

const ROLE_LABEL: Record<ApprovalRole, string> = {
  reviewer: '검토자',
  cooperator: '협조',
  approver: '결재',
}

export function normalizeApprovalRole(input: string | null | undefined): ApprovalRole | null {
  const role = String(input ?? '').trim().toLowerCase()
  if (APPROVAL_ROLES.includes(role as ApprovalRole)) return role as ApprovalRole
  if (role === 'review') return 'reviewer'
  if (role === 'approve' || role === 'final_approver') return 'approver'
  if (role === 'pre_cooperator' || role === 'post_cooperator' || role === 'reference') return 'cooperator'
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
  return normalized === 'reviewer' || normalized === 'cooperator' || normalized === 'approver'
}

export function isFinalApprovalRole(role: string | null | undefined): boolean {
  return normalizeApprovalRole(role) === 'approver'
}
