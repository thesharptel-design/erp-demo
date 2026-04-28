import { toast } from 'sonner'
import { DRAFT_LOCAL_BROWSER_PERSISTENCE_HINT } from '@/lib/draft-server-save-errors'

/** 동일 검증 토스트를 덮어쓰기 위해 고정 id 사용 */
export const DRAFT_VALIDATION_TOAST_ID = 'draft-validation-feedback'

/** 서버 임시저장(동기화) 실패 + 로컬 유지 안내 토스트 */
export const DRAFT_SERVER_SYNC_TOAST_ID = 'draft-server-sync-feedback'

export function dismissDraftValidationToast() {
  toast.dismiss(DRAFT_VALIDATION_TOAST_ID)
  toast.dismiss(DRAFT_SERVER_SYNC_TOAST_ID)
}

/**
 * 기안·출고 작성 화면: 인라인 오류 영역 + 동일 문구 토스트(스크롤 밖에서도 확인 가능)
 */
export function showDraftValidationError(setErrorMessage: (message: string) => void, message: string) {
  setErrorMessage(message)
  toast.error(message, {
    id: DRAFT_VALIDATION_TOAST_ID,
    duration: 7000,
  })
}

/**
 * 서버 임시저장만 실패했고, 브라우저(localStorage)에는 이미 반영된 경우.
 * 원인은 구체적으로, 이어서 로컬 복구 가능 여부를 반드시 안내합니다.
 */
export function showDraftServerSaveFailedWithLocalPersisted(
  setErrorMessage: (message: string) => void,
  serverFailureReason: string
) {
  const headline = '서버에는 임시저장되지 않았습니다.'
  const banner = `${headline}\n\n${serverFailureReason}\n\n${DRAFT_LOCAL_BROWSER_PERSISTENCE_HINT}`
  setErrorMessage(banner)
  toast.warning(`${headline} ${serverFailureReason}`, {
    id: DRAFT_SERVER_SYNC_TOAST_ID,
    duration: 14000,
    description: DRAFT_LOCAL_BROWSER_PERSISTENCE_HINT,
  })
}
