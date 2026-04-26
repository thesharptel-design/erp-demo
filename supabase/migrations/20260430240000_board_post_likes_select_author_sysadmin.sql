-- 게시글 추천(board_post_likes): 본인 행, 해당 글 작성자, 시스템 관리자만 SELECT 가능.
-- 추천 수는 board_posts.like_count(트리거 동기화)로 공개한다.

BEGIN;

DROP POLICY IF EXISTS board_post_likes_select_authenticated ON public.board_post_likes;

CREATE POLICY board_post_likes_select_authenticated
ON public.board_post_likes
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.board_posts p
    WHERE p.id = board_post_likes.post_id
      AND p.author_id = auth.uid()
  )
  OR public.is_system_admin_user(auth.uid())
);

COMMIT;
