-- Fix: non-admin users couldn't comment on notice posts.
-- Cause: board_posts notice trigger blocked every UPDATE when is_notice=true,
-- including comment_count updates triggered by board_comments insert/delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.board_posts_enforce_notice_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT: only admins may create a notice post.
  IF TG_OP = 'INSERT'
     AND NEW.is_notice IS TRUE
     AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION '공지 게시물은 관리자만 지정할 수 있습니다.';
  END IF;

  -- UPDATE: only admins may change notice flag (true<->false).
  -- Other updates on an existing notice post (e.g. comment_count) are allowed.
  IF TG_OP = 'UPDATE'
     AND (NEW.is_notice IS DISTINCT FROM OLD.is_notice)
     AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION '공지 여부는 관리자만 변경할 수 있습니다.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
