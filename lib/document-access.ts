export type DocumentAccessContext = {
  userId: string
  isAdmin: boolean
  writerId?: string | null
  approvalLineApproverIds?: string[]
  participantUserIds?: string[]
}

export function canViewApprovalDocument(ctx: DocumentAccessContext) {
  if (ctx.isAdmin) return true

  const normalizedUserId = String(ctx.userId).toLowerCase()
  if (!normalizedUserId) return false

  if (String(ctx.writerId ?? '').toLowerCase() === normalizedUserId) return true

  const lineMatch =
    ctx.approvalLineApproverIds?.some((id) => String(id).toLowerCase() === normalizedUserId) ?? false
  if (lineMatch) return true

  const participantMatch =
    ctx.participantUserIds?.some((id) => String(id).toLowerCase() === normalizedUserId) ?? false
  return participantMatch
}
