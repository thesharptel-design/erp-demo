'use client'

import { getActionLabel } from '@/lib/approval-document-detail-helpers'

export type ApprovalProcessHistoryRow = {
  id: number
  action_type: string
  actor_id: string
  actor_name?: string | null
  action_at: string
  action_comment: string | null
}

const historyDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatHistoryDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return historyDateFormatter.format(parsed).replace(/\./g, '.').replace(/\s+/g, ' ').trim()
}

export default function ApprovalProcessHistoryPanel({
  rows,
}: {
  rows: ApprovalProcessHistoryRow[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-600">문서 처리 이력</p>
      <p className="mb-3 text-[10px] font-bold leading-snug text-slate-500">
        상신·승인·반려·취소 등 기록이 시간 순으로 남습니다. (재상신 후에도 동일 문서 번호 기준으로 유지됩니다.)
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] border-collapse text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-100">
            <tr>
              <th className="px-2 py-2 font-black text-slate-700">구분</th>
              <th className="px-2 py-2 font-black text-slate-700">처리자</th>
              <th className="px-2 py-2 font-black text-slate-700">일시</th>
              <th className="px-2 py-2 font-black text-slate-700">비고·의견</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="px-2 py-2 font-black text-slate-900">{getActionLabel(h.action_type)}</td>
                <td className="px-2 py-2 font-bold text-slate-800">{h.actor_name?.trim() || h.actor_id || '—'}</td>
                <td className="px-2 py-2 font-bold text-slate-500">
                  {formatHistoryDate(h.action_at)}
                </td>
                <td className="max-w-md px-2 py-2 whitespace-pre-wrap font-bold text-slate-800">
                  {h.action_comment?.trim() ? h.action_comment : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
