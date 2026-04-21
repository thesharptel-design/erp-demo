/**
 * Default item process UI map (major categories → checklist labels).
 * Runtime config is loaded from DB (`item_process_config`); this is the client fallback and seed.
 * Empty arrays still show the category header; detail checkboxes render when entries exist.
 */
export const DEFAULT_ITEM_PROCESS_CATEGORIES = {
  배양: [
    '무균 조작 준수',
    '배양 조건(온도·CO₂ 등) 확인',
    '배양 기간·상태 기록',
    '오염·이상 징후 점검',
  ],
  크로마토: [
    '장비 시스템 적합성(SST)',
    '칼럼·모바일 페이즈 조건 확인',
    '표준품·대조군 대조',
    '피크 식별·적분 검토',
  ],
  '정제/여과': [
    '여과 압력·유량 기록',
    '세척·농축 단계 조성 확인',
    '중간 시험·농도 확인',
    '회수율·폐기 기준 준수',
  ],
  '완제/공통': [
    '최종 라벨·표기 확인',
    '포장 규격·수량 확인',
    '출하 전 최종 검사',
    '보관·취급 주의 표시',
  ],
  일반: [],
  장비: [],
  기타: [],
} as const satisfies Record<string, readonly string[]>

/** Alias for legacy imports — prefer `DEFAULT_ITEM_PROCESS_CATEGORIES` or DB-backed config. */
export const ITEM_CONFIG = DEFAULT_ITEM_PROCESS_CATEGORIES

export type ItemProcessCategories = Record<string, readonly string[]>

export type ItemCategoryKey = keyof typeof DEFAULT_ITEM_PROCESS_CATEGORIES

/** One SOP object path in bucket `sop-files` (see items.process_metadata comment). */
export type SopFileRef = {
  path: string
  name: string
  uploadedAt: string
}

/** Optional JSON on `items.process_metadata`; all keys optional for insert/update. */
export type ProcessMetadata = {
  category?: string
  checks?: Record<string, boolean>
  sopFiles?: SopFileRef[]
}

/** `process_metadata.category` — UI label: 공정명 */
export function getProcessNameFromMetadata(meta: ProcessMetadata | Record<string, unknown> | null | undefined): string {
  if (!meta || typeof meta !== 'object') return ''
  const c = (meta as ProcessMetadata).category
  if (c == null || String(c).trim() === '') return ''
  return String(c).trim()
}

/**
 * Keeps only check keys that exist in the current master template for the item's category.
 * Stale keys (removed/renamed steps in `item_process_config`) are dropped. SOP paths are preserved.
 * Unknown category (not in master map): clears checks so ghosts are not shown until master matches.
 */
export function pruneProcessMetadataToMaster(
  meta: ProcessMetadata,
  categories: ItemProcessCategories
): ProcessMetadata {
  const sopFiles = meta.sopFiles?.length ? [...meta.sopFiles] : undefined
  const cat = (meta.category ?? '').trim()
  const out: ProcessMetadata = {}
  if (sopFiles) out.sopFiles = sopFiles

  if (!cat) {
    return out
  }

  if (!(cat in categories)) {
    out.category = cat
    return out
  }

  const labels = [...(categories[cat] ?? [])]
  out.category = cat
  if (labels.length === 0) {
    return out
  }

  const checks: Record<string, boolean> = {}
  for (const label of labels) {
    if (meta.checks?.[label]) checks[label] = true
  }
  if (Object.keys(checks).length > 0) out.checks = checks
  return out
}

/** Builds optional `process_metadata` for insert/update; empty inputs yield `{}`. */
export function buildProcessMetadata(
  input: {
    category: string
    checks: Record<string, boolean>
    sopFiles: SopFileRef[]
  },
  categories: ItemProcessCategories
): ProcessMetadata {
  const meta: ProcessMetadata = {}
  const cat = input.category.trim()
  if (cat) {
    meta.category = cat
    if (cat in categories) {
      const labels = [...(categories[cat] ?? [])]
      if (labels.length > 0) {
        const filtered: Record<string, boolean> = {}
        for (const label of labels) {
          if (input.checks[label]) filtered[label] = true
        }
        if (Object.keys(filtered).length > 0) meta.checks = filtered
        else delete meta.checks
      } else {
        delete meta.checks
      }
    } else {
      const filtered: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(input.checks)) {
        if (v) filtered[k] = true
      }
      if (Object.keys(filtered).length > 0) meta.checks = filtered
    }
  }
  if (input.sopFiles.length > 0) meta.sopFiles = input.sopFiles
  return meta
}
