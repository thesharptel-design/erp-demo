import type { SupabaseClient } from '@supabase/supabase-js'
import { generateNextSerialDocNo, serialPrefix } from '@/lib/serial-doc-no'

export const appDocNoPrefix = (d?: Date) => serialPrefix('APP', d)
export const droDocNoPrefix = (d?: Date) => serialPrefix('DRO', d)

/**
 * 일반 기안 등 (예: APP-260410-0001).
 * 출고요청(`outbound_request`) 제외한 `approval_docs.doc_no`만 집계.
 */
export async function generateNextAppDocNo(
  client: SupabaseClient
): Promise<string> {
  return generateNextSerialDocNo(client, {
    table: 'approval_docs',
    column: 'doc_no',
    code: 'APP',
    filters: [{ type: 'neq', column: 'doc_type', value: 'outbound_request' }],
  })
}

/**
 * 출고요청 결재 (예: DRO-260410-0001).
 */
export async function generateNextDroDocNo(
  client: SupabaseClient
): Promise<string> {
  return generateNextSerialDocNo(client, {
    table: 'approval_docs',
    column: 'doc_no',
    code: 'DRO',
    filters: [{ type: 'eq', column: 'doc_type', value: 'outbound_request' }],
  })
}
