import {
  isApprovalActionRole,
  isFinalApprovalRole,
  isPostCooperatorRole,
  isPreCooperatorRole,
  normalizeApprovalRole,
} from '@/lib/approval-roles'

export type ApprovalWorkflowAction =
  | 'recall_before_first_action'
  | 'request_cancel_after_action'
  | 'confirm_pre_cooperation'
  | 'approve_document'
  | 'override_approve_document'
  | 'reject_document'
  | 'confirm_post_cooperation'

export type ApprovalRejectType = 'direct' | 'sequential' | 'targeted'

export type ApprovalWorkflowDocLike = {
  status: string | null
}

export type ApprovalWorkflowLineLike = {
  id?: number
  line_no: number
  approver_id: string | null
  approver_role: string | null
  status: string | null
}

export type ApprovalWorkflowParticipantLike = {
  user_id: string | null
  role: string | null
}

export type ApprovalActionAvailability<T extends ApprovalWorkflowLineLike = ApprovalWorkflowLineLike> = {
  actionFlow: T[]
  pendingLine: T | null
  myPendingLine: T | null
  lastApproverLine: T | null
  rejectTargets: T[]
  isWriter: boolean
  isReferenceOnly: boolean
  canRecall: boolean
  canRequestCancel: boolean
  canPreConfirm: boolean
  canApprove: boolean
  canOverrideApprove: boolean
  canReject: boolean
  canPostConfirm: boolean
}

export const APPROVAL_DOC_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'in_progress',
  'approved',
  'effective',
  'closed',
  'rejected',
] as const

export const APPROVAL_LINE_STATUSES = [
  'waiting',
  'pending',
  'confirmed',
  'approved',
  'rejected',
  'skipped',
  'cancelled',
  'invalidated',
] as const

export const APPROVAL_ACTIVE_DOC_STATUSES = new Set(['submitted', 'in_review', 'in_progress'])
export const APPROVAL_EFFECTIVE_DOC_STATUSES = new Set(['approved', 'effective'])
export const APPROVAL_PROCESSED_LINE_STATUSES = new Set(['confirmed', 'approved', 'rejected', 'skipped', 'cancelled'])

export function sameApprovalUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}

export function isApprovalActiveDoc(docOrStatus: ApprovalWorkflowDocLike | string | null | undefined): boolean {
  const status = typeof docOrStatus === 'string' ? docOrStatus : docOrStatus?.status
  return APPROVAL_ACTIVE_DOC_STATUSES.has(String(status ?? ''))
}

export function isApprovalEffectiveDoc(docOrStatus: ApprovalWorkflowDocLike | string | null | undefined): boolean {
  const status = typeof docOrStatus === 'string' ? docOrStatus : docOrStatus?.status
  return APPROVAL_EFFECTIVE_DOC_STATUSES.has(String(status ?? ''))
}

export function isApprovalProcessedLine(lineOrStatus: ApprovalWorkflowLineLike | string | null | undefined): boolean {
  const status = typeof lineOrStatus === 'string' ? lineOrStatus : lineOrStatus?.status
  return APPROVAL_PROCESSED_LINE_STATUSES.has(String(status ?? ''))
}

export function getApprovalActionLines<T extends ApprovalWorkflowLineLike>(lines: T[]): T[] {
  return [...lines]
    .filter((line) => isApprovalActionRole(line.approver_role))
    .sort((a, b) => a.line_no - b.line_no)
}

export function getPendingApprovalWorkflowLine<T extends ApprovalWorkflowLineLike>(lines: T[]): T | null {
  return getApprovalActionLines(lines).find((line) => line.status === 'pending') ?? null
}

export function getNextWaitingBeforePost<T extends ApprovalWorkflowLineLike>(
  lines: T[],
  afterLineNo: number
): T | null {
  return getApprovalActionLines(lines).find((line) => {
    if (line.line_no <= afterLineNo) return false
    if (line.status !== 'waiting') return false
    return isPreCooperatorRole(line.approver_role) || isFinalApprovalRole(line.approver_role)
  }) ?? null
}

export function getPostCooperatorWorkflowLines<T extends ApprovalWorkflowLineLike>(lines: T[]): T[] {
  return [...lines]
    .filter((line) => isPostCooperatorRole(line.approver_role))
    .sort((a, b) => a.line_no - b.line_no)
}

export function findLastApproverLineForUser<T extends ApprovalWorkflowLineLike>(
  lines: T[],
  userId: string
): T | null {
  const approvers = getApprovalActionLines(lines).filter((line) => isFinalApprovalRole(line.approver_role))
  const lastApprover = approvers[approvers.length - 1] ?? null
  if (!lastApprover || !sameApprovalUser(lastApprover.approver_id, userId)) return null
  return lastApprover
}

export function getApprovalRejectTargets<T extends ApprovalWorkflowLineLike>(
  lines: T[],
  actorLine: T | null | undefined
): T[] {
  if (!actorLine) return []
  return getApprovalActionLines(lines).filter((line) => {
    if (line.line_no >= actorLine.line_no) return false
    return line.status === 'confirmed' || line.status === 'approved'
  })
}

export function isApprovalActionLineRole(role: string | null | undefined): boolean {
  const normalized = normalizeApprovalRole(role)
  return normalized === 'pre_cooperator' || normalized === 'approver' || normalized === 'post_cooperator'
}

export function getApprovalActionAvailability<T extends ApprovalWorkflowLineLike>(input: {
  doc: ApprovalWorkflowDocLike & { writer_id?: string | null }
  lines: T[]
  participants?: ApprovalWorkflowParticipantLike[]
  currentUserId: string | null | undefined
}): ApprovalActionAvailability<T> {
  const currentUserId = input.currentUserId
  const actionFlow = getApprovalActionLines(input.lines.filter((line) => isApprovalActionLineRole(line.approver_role)))
  const pendingLine = actionFlow.find((line) => line.status === 'pending') ?? null
  const myPendingLine =
    pendingLine && sameApprovalUser(pendingLine.approver_id, currentUserId) ? pendingLine : null
  const hasProcessedLine = actionFlow.some((line) => isApprovalProcessedLine(line))
  const lastApproverLine = actionFlow.filter((line) => isFinalApprovalRole(line.approver_role)).at(-1) ?? null
  const isLastApprover = Boolean(lastApproverLine && sameApprovalUser(lastApproverLine.approver_id, currentUserId))
  const activeDoc = isApprovalActiveDoc(input.doc)
  const effectiveDoc = isApprovalEffectiveDoc(input.doc)
  const isWriter = sameApprovalUser(input.doc.writer_id, currentUserId)
  const canRecall = isWriter && activeDoc && !hasProcessedLine
  const canRequestCancel = isWriter && activeDoc && hasProcessedLine
  const canPreConfirm = Boolean(myPendingLine && isPreCooperatorRole(myPendingLine.approver_role) && activeDoc)
  const canApprove = Boolean(myPendingLine && isFinalApprovalRole(myPendingLine.approver_role) && activeDoc)
  const canOverrideApprove = activeDoc && isLastApprover
  const canReject = activeDoc && (canApprove || isLastApprover)
  const canPostConfirm =
    effectiveDoc &&
    actionFlow.some(
      (line) =>
        sameApprovalUser(line.approver_id, currentUserId) &&
        isPostCooperatorRole(line.approver_role) &&
        (line.status === 'pending' || line.status === 'waiting')
    )
  const isReferenceOnly = Boolean(
    input.participants?.some(
      (participant) =>
        sameApprovalUser(participant.user_id, currentUserId) && normalizeApprovalRole(participant.role) === 'reference'
    )
  )

  return {
    actionFlow,
    pendingLine,
    myPendingLine,
    lastApproverLine,
    rejectTargets: getApprovalRejectTargets(actionFlow, myPendingLine ?? lastApproverLine),
    isWriter,
    isReferenceOnly,
    canRecall,
    canRequestCancel,
    canPreConfirm,
    canApprove,
    canOverrideApprove,
    canReject,
    canPostConfirm,
  }
}
