import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ApprovalDetailShared } from '@/app/approvals/approval-detail-shared'

export default async function ApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fromAttachment?: string; fromDocNo?: string; fromDocTitle?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  const qs = await searchParams
  const attachmentFrom = {
    enabled: qs.fromAttachment === '1',
    sourceDocNo: qs.fromDocNo ? String(qs.fromDocNo) : null,
    sourceTitle: qs.fromDocTitle ? String(qs.fromDocTitle) : null,
  }
  return <ApprovalDetailShared supabase={supabase} id={id} shellMode="app" attachmentFrom={attachmentFrom} />
}
