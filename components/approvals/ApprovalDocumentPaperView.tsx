import type { ReactNode } from 'react'

export type ApprovalPaperApproverColumn = {
  id: string
  name: string
  sealUrl: string | null
  status: ReactNode
  actedAt: string | null
  /** 승인 완료 시에만 도장(이미지 또는 이니셜) 표시 */
  showSeal: boolean
}

export type ApprovalPaperCooperatorRow = {
  id: string
  dept: string
  name: string
  readStatus: ReactNode
  /** 협조자 `approval_lines.opinion` */
  opinionText?: string | null
}

function SealOrInitials({ name, sealUrl, show }: { name: string; sealUrl: string | null; show: boolean }) {
  if (!show) {
    return <div className="mx-auto min-h-[48px] w-12" aria-hidden />
  }
  if (sealUrl) {
    return (
      <img
        src={sealUrl}
        alt={`${name} 도장`}
        className="mx-auto h-12 w-12 rounded-full border border-red-200 object-cover"
      />
    )
  }
  const label = name ? name.trim().slice(0, 3) : '—'
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-400 text-[10px] font-black text-red-600">
      {label}
    </div>
  )
}

export type ApprovalDocumentPaperViewProps = {
  /** 용지 제목 (기본: 업무기안서) */
  paperTitle?: string
  /** 문서 진행 상태 (배지) */
  docStatusLabel: string
  docStatusClassName: string
  showCancelRequestBadge?: boolean
  writerName: string
  writerDeptName: string
  draftedDate: string
  docNo: string
  writerSealUrl: string | null
  approverColumns: ApprovalPaperApproverColumn[]
  cooperators: ApprovalPaperCooperatorRow[]
  docTypeLabel: string
  referenceText: string
  executionText: string
  agreementText: string | null
  title: string
  contentHtml: string | null
  contentIsHtml: boolean
  /** 기안란 서명 아래 표시 (예: 기안완료 + 일시) */
  drafterStatus: ReactNode
  drafterActedAt: string | null
  /** 기안 칸 도장 표시 (기본 true) */
  drafterShowSeal?: boolean
  /** 본문 직후: 결재·협조 의견·반려 등 */
  afterBodySlot?: ReactNode
  /** 출고 등 본문·의견 아래 추가 블록 */
  postBodyGridSlot?: ReactNode
}

export default function ApprovalDocumentPaperView({
  paperTitle = '업무기안서',
  docStatusLabel,
  docStatusClassName,
  showCancelRequestBadge,
  writerName,
  writerDeptName,
  draftedDate,
  docNo,
  writerSealUrl,
  approverColumns,
  cooperators,
  docTypeLabel,
  referenceText,
  executionText,
  agreementText,
  title,
  contentHtml,
  contentIsHtml,
  drafterStatus,
  drafterActedAt,
  drafterShowSeal = true,
  afterBodySlot,
  postBodyGridSlot,
}: ApprovalDocumentPaperViewProps) {
  const stampColCount = 1 + approverColumns.length

  return (
    <div className="overflow-x-auto">
      <div className="w-full min-w-0 space-y-4 rounded-xl border-2 border-black bg-white p-3 sm:p-4 md:min-w-[860px]">
        <div className="space-y-3 border-b-2 border-black pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">{paperTitle}</h3>
              <p className="mt-1 text-xs font-bold text-gray-500">문서번호 {docNo} · 결재 진행 현황을 확인합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border-2 border-black px-3 py-1 text-xs font-black ${docStatusClassName}`}
              >
                {docStatusLabel}
              </span>
              {showCancelRequestBadge && (
                <span className="animate-pulse rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
                  취소 요청 접수됨
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <table className="w-full table-fixed border border-black text-left text-xs lg:w-[300px] lg:flex-shrink-0">
              <tbody>
                <tr className="border-b border-black">
                  <th className="w-[28%] border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">기안자</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{writerName || '—'}</td>
                </tr>
                <tr className="border-b border-black">
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">부서</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{writerDeptName || '—'}</td>
                </tr>
                <tr className="border-b border-black">
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">기안일</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{draftedDate}</td>
                </tr>
                <tr>
                  <th className="border-r border-black bg-gray-100 px-2 py-2 font-black text-gray-800">문서번호</th>
                  <td className="px-2 py-2 font-bold text-gray-900">{docNo}</td>
                </tr>
              </tbody>
            </table>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="overflow-x-auto rounded border border-black">
                <table className="w-full table-fixed border-collapse text-center text-xs">
                  <colgroup>
                    {Array.from({ length: stampColCount }).map((_, i) => (
                      <col key={i} style={{ width: `${100 / stampColCount}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-black bg-gray-100">
                      <th className="border-r border-black px-2 py-2 font-black text-gray-800">기안</th>
                      {approverColumns.map((col) => (
                        <th key={col.id} className="border-l border-black px-2 py-2 font-black text-gray-800">
                          결재
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-black">
                      <td className="min-w-0 border-r border-black bg-white px-2 py-3 font-bold text-gray-900">
                        <span className="block truncate">{writerName || '—'}</span>
                      </td>
                      {approverColumns.map((col) => (
                        <td
                          key={col.id}
                          className="min-w-0 border-l border-black bg-white px-2 py-3 font-bold text-gray-900"
                        >
                          <span className="block truncate">{col.name || '—'}</span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border-r border-black bg-gray-50 px-1 py-3 align-top">
                        <div className="flex flex-col items-center gap-1">
                          <SealOrInitials name={writerName} sealUrl={writerSealUrl} show={drafterShowSeal} />
                          <div className="text-[10px] font-bold text-gray-600">{drafterStatus}</div>
                          {drafterActedAt && (
                            <div className="text-[9px] font-bold text-gray-400">
                              {new Date(drafterActedAt).toLocaleString('ko-KR')}
                            </div>
                          )}
                        </div>
                      </td>
                      {approverColumns.map((col) => (
                        <td key={`sig-${col.id}`} className="border-l border-black bg-gray-50 px-1 py-3 align-top">
                          <div className="flex flex-col items-center gap-1">
                            <SealOrInitials name={col.name} sealUrl={col.sealUrl} show={col.showSeal} />
                            <div className="text-[10px] font-bold text-gray-600">{col.status}</div>
                            {col.actedAt && (
                              <div className="text-[9px] font-bold text-gray-400">
                                {new Date(col.actedAt).toLocaleString('ko-KR')}
                              </div>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded border border-gray-400 bg-gray-50 p-2">
                <p className="mb-2 border-b border-gray-300 pb-1 text-center text-[11px] font-black text-gray-800">협조</p>
                {cooperators.length === 0 ? (
                  <p className="py-2 text-center text-[11px] font-bold text-gray-500">등록된 협조자가 없습니다.</p>
                ) : (
                  <table className="w-full table-fixed border border-gray-300 bg-white text-left text-[11px]">
                    <colgroup>
                      <col className="w-[4.25rem]" />
                      <col className="w-[5.25rem]" />
                      <col className="w-[4.75rem]" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border-b border-gray-300 px-1 py-1 text-[10px] font-black">부서</th>
                        <th className="border-b border-l border-gray-300 px-1 py-1 text-[10px] font-black">이름</th>
                        <th className="border-b border-l border-gray-300 px-1 py-1 text-[10px] font-black">확인</th>
                        <th className="border-b border-l border-gray-300 px-2 py-1 text-[10px] font-black">의견</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cooperators.map((row) => (
                        <tr key={row.id} className="border-t border-gray-200">
                          <td className="max-w-0 truncate px-1 py-1.5 text-[10px] font-bold text-gray-800" title={row.dept}>
                            {row.dept}
                          </td>
                          <td
                            className="max-w-0 truncate border-l border-gray-200 px-1 py-1.5 text-[10px] font-bold text-gray-900"
                            title={row.name}
                          >
                            {row.name}
                          </td>
                          <td className="border-l border-gray-200 px-1 py-1.5 text-center [&>*]:inline-flex">
                            {row.readStatus}
                          </td>
                          <td className="min-w-0 border-l border-gray-200 px-2 py-1.5 text-[10px] font-bold leading-snug text-gray-800">
                            {row.opinionText?.trim() ? (
                              <span className="block whitespace-pre-wrap break-words">{row.opinionText}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 border border-gray-200 text-sm sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr]">
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">시행일자</div>
          <div className="border-b px-3 py-2 text-sm font-bold text-gray-900">{executionText}</div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">문서유형</div>
          <div className="border-b px-3 py-2">
            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">{docTypeLabel}</p>
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">참조</div>
          <div className="border-b px-3 py-2">
            <p className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">
              {referenceText || '—'}
            </p>
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">합의</div>
          <div className="border-b px-3 py-2">
            <p className="whitespace-pre-wrap text-sm font-medium text-gray-800">{agreementText?.trim() ? agreementText : '—'}</p>
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">제목</div>
          <div className="border-b px-3 py-2">
            <p className="text-sm font-black text-gray-900">{title}</p>
          </div>
          <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">본문</div>
          <div className="border-b px-3 py-2">
            {contentHtml && contentIsHtml ? (
              <div
                className="approval-doc-html min-h-[150px] text-sm leading-relaxed text-gray-800 [&_img]:max-h-96 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-gray-200 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            ) : (
              <p className="min-h-[150px] whitespace-pre-wrap text-sm font-medium leading-relaxed text-gray-700">
                {contentHtml?.trim() ? contentHtml : '내용 없음'}
              </p>
            )}
          </div>
          {afterBodySlot ? (
            <>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">
                의견
                <span className="mt-0.5 block text-[10px] font-bold normal-case text-gray-500">결재·협조·참조</span>
              </div>
              <div className="border-b px-3 py-2">{afterBodySlot}</div>
            </>
          ) : null}
          {postBodyGridSlot ? (
            <>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">출고</div>
              <div className="border-b px-3 py-2">{postBodyGridSlot}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
