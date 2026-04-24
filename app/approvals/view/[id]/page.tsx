import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ApprovalDetailShared } from '@/app/approvals/approval-detail-shared'

export default async function ApprovalDetailViewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  return <ApprovalDetailShared supabase={supabase} id={id} shellMode="bare" />
}
