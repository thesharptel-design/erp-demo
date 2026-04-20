import { redirect } from 'next/navigation'

type SearchParams = Record<string, string | string[] | undefined>

export default async function LegacyOutboundNewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const resolved = await searchParams
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') query.set(key, value)
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, v)
    }
  }

  const nextHref = `/outbound-requests/new${query.toString() ? `?${query.toString()}` : ''}`
  redirect(nextHref)
}