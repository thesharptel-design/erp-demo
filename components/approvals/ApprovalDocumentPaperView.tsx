import type { ReactNode } from 'react'
import BoardPostBodyWithLightbox from '@/components/groupware/BoardPostBodyWithLightbox'

/** 기안 옆 날인 테이블: 결재·협조를 결재선 순서대로 한 열씩 표시 */
export type ApprovalPaperStampColumn = {
  id: string
  role: 'approver' | 'pre_cooperator' | 'post_cooperator'
  name: string
  employeeNo?: string | null
  sealUrl: string | null
  status: ReactNode
  actedAt: string | null
  /** 승인(또는 협조 확인) 완료 시 도장·이니셜 표시 */
  showSeal: boolean
  /** 협조 열: 읽음/안읽음 뱃지 */
  readStatus?: ReactNode
  /** 협조 열: `approval_lines.opinion` */
  opinionText?: string | null
}

const paperDateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatPaperDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return paperDateTimeFormatter.format(parsed)
}

function SealOrInitials({ name, sealUrl, show }: { name: string; sealUrl: string | null; show: boolean }) {
  if (!show) {
    return <div className="mx-auto h-10 w-10 shrink-0" aria-hidden />
  }
  if (sealUrl) {
    return (
      <img
        src={sealUrl}
        alt={`${name} 도장`}
        className="mx-auto h-12 w-12 rounded-full border border-border object-cover"
      />
    )
  }
  const label = name ? name.trim().slice(0, 3) : '—'
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-destructive/50 text-[10px] font-black text-destructive">
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
  writerEmployeeNo?: string | null
  writerDeptName: string
  draftedDate: string
  docNo: string
  writerSealUrl: string | null
  stampColumns: ApprovalPaperStampColumn[]
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
  /**
   * 최종 승인 후 결재취소(`remarks === 결재 취소`) 시 본문 아래: 처리자·일시·의견.
   * (구버전 본문에 붙은 `[결재 취소 의견]:` 은 상위에서 제거한 `contentHtml`을 넘김)
   */
  postApprovalCancelRow?: { actorName: string; opinion: string | null; at: string | null } | null
  /** 본문 직후: 결재·협조 의견·반려 등 */
  afterBodySlot?: ReactNode
  /** 출고 등 본문·의견 아래 추가 블록 */
  postBodyGridSlot?: ReactNode
  /** 본문 아래 첨부 문서/파일 */
  attachmentsSlot?: ReactNode
}

export default function ApprovalDocumentPaperView({
  paperTitle = '업무기안서',
  docStatusLabel,
  docStatusClassName,
  showCancelRequestBadge,
  writerName,
  writerEmployeeNo,
  writerDeptName,
  draftedDate,
  docNo,
  writerSealUrl,
  stampColumns,
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
  postApprovalCancelRow,
  afterBodySlot,
  postBodyGridSlot,
  attachmentsSlot,
}: ApprovalDocumentPaperViewProps) {
  const stampColCount = 1 + stampColumns.length

  return (
    <div className="overflow-x-auto">
      <div className="w-full min-w-0 space-y-4 rounded-xl border-2 border-border bg-card p-3 font-sans antialiased sm:p-4 md:min-w-[860px]">
        <div className="space-y-3 border-b-2 border-border pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">{paperTitle}</h3>
              <p className="mt-1 text-xs font-bold text-muted-foreground">문서번호 {docNo} · 결재 진행 현황을 확인합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border-2 border-foreground/15 px-3 py-1 text-xs font-black ${docStatusClassName}`}
              >
                {docStatusLabel}
              </span>
              {showCancelRequestBadge && (
                <span className="animate-pulse rounded-full bg-destructive px-3 py-1 text-xs font-black text-destructive-foreground">
                  취소 요청 접수됨
                </span>
              )}
            </div>
          </div>

          <div className="grid overflow-hidden rounded-md border-2 border-border lg:grid-cols-[16.875rem_minmax(0,1fr)]">
              <table className="w-full table-fixed border-collapse border-b border-border text-left text-xs lg:border-b-0 lg:border-r">
                <tbody>
                  <tr className="border-b border-border">
                    <th className="w-[32%] border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">기안자</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerName || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">부서</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerDeptName || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">사번</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{writerEmployeeNo?.trim() || '—'}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">기안일</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{draftedDate}</td>
                  </tr>
                  <tr>
                    <th className="border-r border-border bg-muted px-2 py-1.5 font-black text-foreground">문서번호</th>
                    <td className="px-2 py-1.5 font-bold text-foreground">{docNo}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex min-h-0 min-w-0 items-stretch justify-center overflow-x-auto bg-card lg:min-h-0">
                <table className="h-full w-full min-w-0 table-fixed border-collapse text-center text-xs sm:min-w-[260px]">
                  <colgroup>
                    {Array.from({ length: stampColCount }).map((_, i) => (
                      <col key={i} style={{ width: `${100 / stampColCount}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="border-r border-border px-1.5 py-1.5 font-black text-foreground sm:px-2 sm:py-2">기안</th>
                      {stampColumns.map((col) => (
                        <th key={col.id} className="border-l border-border px-1.5 py-1.5 font-black text-foreground sm:px-2 sm:py-2">
                          {col.role === 'pre_cooperator' || col.role === 'post_cooperator' ? '협조' : '결재'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    <tr className="border-b border-border">
                      <td className="min-w-0 border-r border-border bg-card px-1.5 py-2 font-bold text-foreground sm:px-2 sm:py-2.5">
                        <span className="block truncate">{writerName || '—'}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                          {writerEmployeeNo?.trim() || '-'}
                        </span>
                      </td>
                      {stampColumns.map((col) => (
                        <td
                          key={col.id}
                          className="min-w-0 border-l border-border bg-card px-1.5 py-2 font-bold text-foreground sm:px-2 sm:py-2.5"
                        >
                          <span className="block truncate">{col.name || '—'}</span>
                          <span className="mt-0.5 block truncate text-[10px] font-bold text-muted-foreground">
                            {col.employeeNo?.trim() || '-'}
                          </span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border-r border-border bg-muted/45 px-1 py-3 align-top sm:px-2 sm:py-4">
                        <div className="flex flex-col items-center gap-0.5">
                          <SealOrInitials name={writerName} sealUrl={writerSealUrl} show={drafterShowSeal} />
                          <div className="text-[10px] font-bold text-muted-foreground">{drafterStatus}</div>
                          {drafterActedAt && (
                            <div className="text-[9px] font-bold text-muted-foreground">
                              {new Date(drafterActedAt).toLocaleString('ko-KR')}
                            </div>
                          )}
                        </div>
                      </td>
                      {stampColumns.map((col) => (
                        <td key={`sig-${col.id}`} className="border-l border-border bg-muted/45 px-1 py-3 align-top sm:px-2 sm:py-4">
                          <div className="flex flex-col items-center gap-0.5">
                            <SealOrInitials name={col.name} sealUrl={col.sealUrl} show={col.showSeal} />
                            {(col.role === 'pre_cooperator' || col.role === 'post_cooperator') && col.readStatus ? (
                              <div className="[&>*]:inline-flex">{col.readStatus}</div>
                            ) : null}
                            <div className="text-[10px] font-bold text-muted-foreground">{col.status}</div>
                            {col.actedAt && (
                              <div className="text-[9px] font-bold text-muted-foreground">
                                {new Date(col.actedAt).toLocaleString('ko-KR')}
                              </div>
                            )}
                            {(col.role === 'pre_cooperator' || col.role === 'post_cooperator') && col.opinionText?.trim() ? (
                              <p className="max-w-full px-0.5 text-left text-[9px] font-bold leading-snug break-words text-foreground">
                                {col.opinionText}
                              </p>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
          </div>
        </div>

        <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border text-sm sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr]">
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">시행일자</div>
          <div className="border-b px-3 py-2 text-sm font-bold text-foreground">{executionText}</div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">문서유형</div>
          <div className="border-b px-3 py-2">
            <p className="rounded-md border border-border bg-muted/45 px-3 py-2 text-sm font-bold text-foreground">{docTypeLabel}</p>
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">참조</div>
          <div className="border-b px-3 py-2">
            <p className="rounded-md border border-dashed border-border bg-muted/45 px-3 py-2 text-sm font-bold text-foreground">
              {referenceText || '—'}
            </p>
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">합의</div>
          <div className="border-b px-3 py-2">
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{agreementText?.trim() ? agreementText : '—'}</p>
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">제목</div>
          <div className="border-b px-3 py-2">
            <p className="text-sm font-black text-foreground">{title}</p>
          </div>
          <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">본문</div>
          <div className="border-b px-3 py-2">
            {contentHtml && contentIsHtml ? (
              <BoardPostBodyWithLightbox
                html={contentHtml}
                className="approval-doc-html min-h-[150px] text-sm leading-relaxed text-foreground [&_img]:max-h-96 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-border [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6"
              />
            ) : (
              <p className="min-h-[150px] whitespace-pre-wrap text-sm font-medium leading-relaxed text-foreground">
                {contentHtml?.trim() ? contentHtml : '내용 없음'}
              </p>
            )}
          </div>
          {postApprovalCancelRow ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">
                결재 취소
                <span className="mt-0.5 block text-[10px] font-bold normal-case text-muted-foreground">
                  승인 완료 후 취소
                </span>
              </div>
              <div className="border-b px-3 py-2 text-sm">
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5">
                  <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-[5rem_1fr]">
                    <p className="font-black text-muted-foreground">처리자</p>
                    <p className="font-bold text-foreground">{postApprovalCancelRow.actorName?.trim() || '—'}</p>
                    <p className="font-black text-muted-foreground">일시</p>
                    <p className="font-bold text-foreground">{formatPaperDateTime(postApprovalCancelRow.at)}</p>
                    <p className="font-black text-muted-foreground">의견</p>
                    <p className="whitespace-pre-wrap break-words font-bold leading-relaxed text-foreground">
                      {postApprovalCancelRow.opinion?.trim() ? postApprovalCancelRow.opinion : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {afterBodySlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">
                의견
                <span className="mt-0.5 block text-[10px] font-bold normal-case text-muted-foreground">결재·협조·참조</span>
              </div>
              <div className="border-b px-3 py-2">{afterBodySlot}</div>
            </>
          ) : null}
          {postBodyGridSlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">출고</div>
              <div className="border-b px-3 py-2">{postBodyGridSlot}</div>
            </>
          ) : null}
          {attachmentsSlot ? (
            <>
              <div className="border-b bg-muted/45 px-3 py-2 font-black text-foreground sm:border-r">첨부문서</div>
              <div className="border-b px-3 py-2">{attachmentsSlot}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
