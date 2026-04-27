-- Keep board comment insert non-blocking even if notification fanout fails.
-- Symptom addressed: in some posts (e.g. notices), comment insert could fail when
-- AFTER INSERT fanout hits notification table constraints/policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.board_comments_fanout_notifications_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author uuid;
  v_parent_author uuid;
  v_dedupe text;
  v_event_id uuid;
  v_notif_type text;
  v_title text;
  v_target_url text;
  v_recipient uuid;
BEGIN
  SELECT p.author_id
  INTO v_post_author
  FROM public.board_posts p
  WHERE p.id = NEW.post_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.author_id
    INTO v_parent_author
    FROM public.board_comments c
    WHERE c.id = NEW.parent_id;
  ELSE
    v_parent_author := NULL;
  END IF;

  v_dedupe := 'board:comment:' || NEW.id::text;

  -- No recipients: skip creating an orphan event row.
  IF NOT (
    (v_post_author IS NOT NULL AND v_post_author IS DISTINCT FROM NEW.author_id)
    OR (v_parent_author IS NOT NULL AND v_parent_author IS DISTINCT FROM NEW.author_id)
  ) THEN
    RETURN NEW;
  END IF;

  -- Notification fanout must never block comment creation.
  BEGIN
    IF NEW.parent_id IS NULL THEN
      v_notif_type := 'board_comment';
      v_title := '게시글에 새 댓글이 있습니다.';
    ELSE
      v_notif_type := 'board_reply';
      v_title := '댓글에 새 답글이 있습니다.';
    END IF;

    v_target_url := '/groupware/board/' || NEW.post_id::text;

    INSERT INTO public.notification_events (
      actor_id,
      category,
      type,
      title,
      payload,
      target_url,
      dedupe_key
    )
    VALUES (
      NEW.author_id,
      'board',
      v_notif_type,
      v_title,
      jsonb_build_object(
        'post_id', NEW.post_id,
        'comment_id', NEW.id,
        'parent_id', NEW.parent_id
      ),
      v_target_url,
      v_dedupe
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT e.id INTO v_event_id FROM public.notification_events e WHERE e.dedupe_key = v_dedupe;
    END IF;

    IF v_event_id IS NOT NULL THEN
      FOR v_recipient IN
        SELECT DISTINCT x.uid
        FROM (
          SELECT v_post_author AS uid
          WHERE v_post_author IS NOT NULL
            AND v_post_author IS DISTINCT FROM NEW.author_id
          UNION ALL
          SELECT v_parent_author AS uid
          WHERE v_parent_author IS NOT NULL
            AND v_parent_author IS DISTINCT FROM NEW.author_id
        ) AS x(uid)
      LOOP
        INSERT INTO public.user_notifications (user_id, event_id)
        VALUES (v_recipient, v_event_id)
        ON CONFLICT (user_id, event_id) DO NOTHING;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'board_comments_fanout_notifications_on_insert skipped for comment %, reason: %',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.board_comments_fanout_notifications_on_insert() FROM PUBLIC;

COMMIT;
