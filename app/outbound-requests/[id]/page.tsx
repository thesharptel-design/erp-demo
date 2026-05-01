import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OutboundDetailShared } from '@/app/outbound-requests/outbound-detail-shared'

export default async function OutboundRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fromAttachment?: string; fromDocNo?: string; fromDocTitle?: string; from?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params
  const qs = await searchParams
  const attachmentFrom = {
    enabled: qs.fromAttachment === '1',
    sourceDocNo: qs.fromDocNo ? String(qs.fromDocNo) : null,
    sourceTitle: qs.fromDocTitle ? String(qs.fromDocTitle) : null,
  }
  return (
    <OutboundDetailShared
      supabase={supabase}
      id={id}
      shellMode="app"
      attachmentFrom={attachmentFrom}
      showDispatchControlBox={false}
    />
  )
}
