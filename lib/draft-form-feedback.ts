import { toast } from 'sonner'

/** 동일 검증 토스트를 덮어쓰기 위해 고정 id 사용 */
export const DRAFT_VALIDATION_TOAST_ID = 'draft-validation-feedback'

export function dismissDraftValidationToast() {
  toast.dismiss(DRAFT_VALIDATION_TOAST_ID)
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
