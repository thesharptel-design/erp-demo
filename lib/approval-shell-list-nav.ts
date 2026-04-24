/**
 * 베어 셸(팝업) 상세에서 「목록」: opener 목록 새로고침 → 창 닫기 →
 * 닫히지 않았을 때(직접 연 탭 등) href로 이동.
 */
export function runApprovalShellListReturnToList(href: string) {
  try {
    window.opener?.location.reload()
  } catch {
    /* cross-origin 등 */
  }
  window.close()
  window.setTimeout(() => {
    window.location.href = href
  }, 150)
}
