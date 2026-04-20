BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_outbound_cancellation(p_doc_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.outbound_requests%ROWTYPE;
  r_tx public.inventory_transactions%ROWTYPE;
  v_req_no text;
  v_pattern text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_req
    FROM public.outbound_requests
   WHERE approval_doc_id = p_doc_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_request not found for approval_doc_id %', p_doc_id;
  END IF;

  v_req_no := coalesce(v_req.req_no::text, '');
  v_pattern := '%출고요청(' || v_req_no || ')%';

  FOR r_tx IN
    SELECT *
      FROM public.inventory_transactions
     WHERE trans_type = 'OUT'
       AND (
         (ref_table = 'outbound_requests' AND ref_id = v_req.id)
         OR (ref_table IS NULL AND ref_id IS NULL AND remarks LIKE v_pattern)
       )
     ORDER BY id
  LOOP
    IF r_tx.inventory_id IS NOT NULL THEN
      UPDATE public.inventory
         SET current_qty = current_qty + r_tx.qty,
             available_qty = available_qty + r_tx.qty,
             updated_at = now()
       WHERE id = r_tx.inventory_id
         AND warehouse_id = v_req.warehouse_id;
    ELSE
      UPDATE public.inventory inv
         SET current_qty = inv.current_qty + r_tx.qty,
             available_qty = inv.available_qty + r_tx.qty,
             updated_at = now()
        FROM (
          SELECT id
            FROM public.inventory
           WHERE item_id = r_tx.item_id
             AND warehouse_id = v_req.warehouse_id
             AND lot_no IS NOT DISTINCT FROM r_tx.lot_no
             AND exp_date IS NOT DISTINCT FROM r_tx.exp_date
             AND serial_no IS NOT DISTINCT FROM r_tx.serial_no
           ORDER BY id
           LIMIT 1
        ) pick
       WHERE inv.id = pick.id;
    END IF;

    INSERT INTO public.inventory_transactions (
      item_id, trans_type, qty, lot_no, exp_date, serial_no,
      remarks, trans_date, actor_id, created_by, ref_table, ref_id,
      inventory_id, warehouse_id
    ) VALUES (
      r_tx.item_id, 'CANCEL_IN', r_tx.qty, r_tx.lot_no, r_tx.exp_date, r_tx.serial_no,
      format('출고취소(%s) 재고복원', v_req.req_no), now(), v_actor, v_actor, 'outbound_requests', v_req.id,
      r_tx.inventory_id, v_req.warehouse_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_outbound_cancellation(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_outbound_cancellation(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_outbound_cancellation(bigint) TO service_role;

COMMIT;
