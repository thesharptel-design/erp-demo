export const APPROVAL_ROLES = [
  'reviewer',
  'pre_cooperator',
  'final_approver',
  'post_cooperator',
  'reference',
] as const

export type ApprovalRole = (typeof APPROVAL_ROLES)[number]

const ROLE_ORDER: Record<ApprovalRole, number> = {
  reviewer: 1,
  pre_cooperator: 2,
  final_approver: 3,
  post_cooperator: 4,
  reference: 5,
}

const ROLE_LABEL: Record<ApprovalRole, string> = {
  reviewer: '검토자',
  pre_cooperator: '사전 협조',
  final_approver: '최종 결재',
  post_cooperator: '사후 협조',
  reference: '참조',
}

export function normalizeApprovalRole(input: string | null | undefined): ApprovalRole | null {
  const role = String(input ?? '').trim().toLowerCase()
  if (APPROVAL_ROLES.includes(role as ApprovalRole)) return role as ApprovalRole
  if (role === 'review') return 'reviewer'
  if (role === 'approve') return 'final_approver'
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
  return normalized === 'reviewer' || normalized === 'pre_cooperator' || normalized === 'final_approver'
}
