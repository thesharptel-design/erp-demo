import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OutboundDetailShared } from '@/app/outbound-requests/outbound-detail-shared'

export default async function OutboundRequestDetailViewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  return <OutboundDetailShared supabase={supabase} id={id} shellMode="bare" />
}
