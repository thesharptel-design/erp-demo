import type { SupabaseClient } from '@supabase/supabase-js'

import type { Json } from '@/lib/database.types'
import { DEFAULT_ITEM_PROCESS_CATEGORIES, type ItemProcessCategories } from '@/lib/item-config'

/** Untyped client: `Database` typings are a partial subset of the real schema. */
type Client = SupabaseClient

/** Parse DB jsonb into category map; invalid shapes fall back to bundled default. */
export function parseItemProcessCategoriesJson(raw: unknown): ItemProcessCategories {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_ITEM_PROCESS_CATEGORIES
  }
  const out: ItemProcessCategories = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(k).trim()
    if (!name) continue
    if (!Array.isArray(v)) {
      out[name] = []
      continue
    }
    const labels = v.map((x) => String(x).trim()).filter(Boolean)
    out[name] = labels
  }
  if (Object.keys(out).length === 0) return DEFAULT_ITEM_PROCESS_CATEGORIES
  return out
}

export async function fetchItemProcessCategories(client: Client): Promise<ItemProcessCategories> {
  const { data, error } = await client.from('item_process_config').select('categories').eq('id', 1).maybeSingle()

  if (error || !data?.categories) {
    return DEFAULT_ITEM_PROCESS_CATEGORIES
  }
  return parseItemProcessCategoriesJson(data.categories)
}

export async function saveItemProcessCategories(
  client: Client,
  categories: ItemProcessCategories,
  userId: string | null
): Promise<{ errorMessage: string | null }> {
  const payload: { id: number; categories: Json; updated_by: string | null } = {
    id: 1,
    categories: categories as unknown as Json,
    updated_by: userId,
  }
  const { error } = await client.from('item_process_config').upsert(payload, { onConflict: 'id' })
  if (error) return { errorMessage: error.message }
  return { errorMessage: null }
}
