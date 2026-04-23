-- Soft-delete / edit-with-replies flags for board_comments.

BEGIN;

ALTER TABLE public.board_comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.board_comments
  ADD COLUMN IF NOT EXISTS modified_after_reply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.board_comments.is_deleted IS 'When true, UI shows only [삭제된 댓글입니다]; used when the comment has child replies.';
COMMENT ON COLUMN public.board_comments.modified_after_reply IS 'When true, UI shows [수정된 댓글입니다] above body (author edited while replies existed).';

COMMIT;
