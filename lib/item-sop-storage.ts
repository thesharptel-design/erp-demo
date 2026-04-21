import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProcessMetadata, SopFileRef } from '@/lib/item-config'

const REMOVE_BATCH = 100

function normalizePrefix(itemId: number) {
  return `item-${itemId}/`
}

/**
 * Collects object paths under `sop-files` for a row: metadata paths plus
 * optional bucket listing under `item-{id}/` (orphan cleanup).
 */
export async function collectSopStoragePathsForItem(
  client: SupabaseClient,
  itemId: number,
  processMetadata: ProcessMetadata | null | undefined
): Promise<string[]> {
  const paths = new Set<string>()
  const prefix = normalizePrefix(itemId)

  for (const f of processMetadata?.sopFiles ?? []) {
    const p = f.path?.trim()
    if (p) paths.add(p)
  }

  const { data: listed, error } = await client.storage.from('sop-files').list(prefix, {
    limit: 1000,
  })
  if (!error && listed) {
    for (const obj of listed) {
      if (obj.name) paths.add(`${prefix}${obj.name}`)
    }
  }

  return [...paths]
}

/**
 * Removes every object in `sop-files` tied to an item (metadata `sopFiles[].path`
 * plus objects listed under `item-{itemId}/`). Call this **before** deleting the
 * `items` row — used from single-item delete and bulk delete in the same order.
 */
export async function deleteSopFilesForItem(
  client: SupabaseClient,
  itemId: number,
  processMetadata: ProcessMetadata | null | undefined
): Promise<{ errorMessage: string | null }> {
  const paths = await collectSopStoragePathsForItem(client, itemId, processMetadata)
  if (paths.length === 0) return { errorMessage: null }

  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const chunk = paths.slice(i, i + REMOVE_BATCH)
    const { error } = await client.storage.from('sop-files').remove(chunk)
    if (error) {
      return { errorMessage: error.message }
    }
  }
  return { errorMessage: null }
}

export async function uploadItemSopFile(
  client: SupabaseClient,
  itemId: number,
  file: File
): Promise<{ ref: SopFileRef | null; errorMessage: string | null }> {
  const safeName = file.name.replace(/[/\\]/g, '_')
  const path = `item-${itemId}/${Date.now()}-${safeName}`
  const { error } = await client.storage.from('sop-files').upload(path, file, { upsert: false })
  if (error) return { ref: null, errorMessage: error.message }
  const ref: SopFileRef = {
    path,
    name: file.name,
    uploadedAt: new Date().toISOString(),
  }
  return { ref, errorMessage: null }
}
