import type { ApprovalOpinionRowVm } from '@/lib/approval-line-opinions'

export default function ApprovalLineOpinionsBlock({ rows }: { rows: ApprovalOpinionRowVm[] }) {
  if (rows.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold leading-snug text-gray-600">
        승인·반려·협조·참조 처리가 끝난 차수를 표시합니다. 의견을 적지 않은 경우{' '}
        <span className="font-black text-gray-800">[-]</span>로 표시됩니다.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        <thead className="border-b border-gray-200 bg-gray-100">
          <tr>
            <th className="px-2 py-2 font-black text-gray-700">순번</th>
            <th className="px-2 py-2 font-black text-gray-700">구분</th>
            <th className="px-2 py-2 font-black text-gray-700">처리자</th>
            <th className="px-2 py-2 font-black text-gray-700">상태</th>
            <th className="px-2 py-2 font-black text-gray-700">처리일시</th>
            <th className="px-2 py-2 font-black text-gray-700">의견·반려</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-2 font-bold text-gray-500">{r.lineNo}</td>
              <td className="px-2 py-2 font-black text-gray-800">{r.roleLabel}</td>
              <td className="px-2 py-2 font-bold text-gray-900">{r.name}</td>
              <td className="px-2 py-2 font-bold text-gray-700">{r.statusLabel}</td>
              <td className="px-2 py-2 font-bold text-gray-500">
                {r.actedAt ? new Date(r.actedAt).toLocaleString('ko-KR') : '—'}
              </td>
              <td className="max-w-md px-2 py-2 whitespace-pre-wrap font-bold text-gray-900">{r.body}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
