-- Outbound fulfillment + cancellation stock logic (single transaction per RPC call).
-- Document number uniqueness for serial generators (see lib/serial-doc-no.ts).

-- ---------------------------------------------------------------------------
-- inventory_transactions: link each OUT row to source inventory + request
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS inventory_id bigint REFERENCES public.inventory (id);

COMMENT ON COLUMN public.inventory_transactions.inventory_id IS
  'Source inventory row for OUT; used by finalize_outbound_cancellation to restore qty.';

-- ---------------------------------------------------------------------------
-- Unique document numbers (partial where column is not null)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_docs_doc_no ON public.approval_docs (doc_no)
  WHERE doc_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_quote_no ON public.quotes (quote_no)
  WHERE quote_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_po_no ON public.purchase_orders (po_no)
  WHERE po_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_production_orders_prod_no ON public.production_orders (prod_no)
  WHERE prod_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_orders_outbound_no ON public.outbound_orders (outbound_no)
  WHERE outbound_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_requests_qc_no ON public.qc_requests (qc_no)
  WHERE qc_no IS NOT NULL;

-- ---------------------------------------------------------------------------
-- execute_outbound_request_fulfillment
-- p_lines: [{ "inventory_id": <int>, "item_id": <int>, "qty": <number> }, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_outbound_request_fulfillment(
  p_outbound_request_id bigint,
  p_lines jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.outbound_requests%ROWTYPE;
  v_line jsonb;
  v_inv public.inventory%ROWTYPE;
  v_qty numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
    INTO v_req
    FROM public.outbound_requests
   WHERE id = p_outbound_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_request not found: %', p_outbound_request_id;
  END IF;

  IF v_req.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'outbound_request must be approved (current status: %)', v_req.status;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'p_lines must be a non-empty json array';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := (v_line ->> 'qty')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty in line: %', v_line;
    END IF;

    SELECT *
      INTO v_inv
      FROM public.inventory
     WHERE id = (v_line ->> 'inventory_id')::bigint
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory row not found: %', (v_line ->> 'inventory_id');
    END IF;

    IF v_inv.item_id IS DISTINCT FROM (v_line ->> 'item_id')::bigint THEN
      RAISE EXCEPTION 'item_id does not match inventory row';
    END IF;

    IF v_inv.current_qty < v_qty THEN
      RAISE EXCEPTION 'insufficient stock for inventory_id % (have %, need %)',
        v_inv.id, v_inv.current_qty, v_qty;
    END IF;

    UPDATE public.inventory
       SET current_qty = current_qty - v_qty,
           available_qty = available_qty - v_qty,
           updated_at = now()
     WHERE id = v_inv.id;

    INSERT INTO public.inventory_transactions (
      item_id,
      trans_type,
      qty,
      lot_no,
      exp_date,
      serial_no,
      remarks,
      trans_date,
      actor_id,
      created_by,
      ref_table,
      ref_id,
      inventory_id
    ) VALUES (
      v_inv.item_id,
      'OUT',
      v_qty,
      v_inv.lot_no,
      v_inv.exp_date,
      v_inv.serial_no,
      format('출고요청(%s) 기반', v_req.req_no),
      now(),
      v_actor,
      v_actor,
      'outbound_requests',
      p_outbound_request_id,
      v_inv.id
    );
  END LOOP;

  UPDATE public.outbound_requests
     SET status = 'completed',
         updated_at = now()
   WHERE id = p_outbound_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_outbound_request_fulfillment(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_outbound_request_fulfillment(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_outbound_request_fulfillment(bigint, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- finalize_outbound_cancellation
-- Restores stock from OUT transactions for this outbound request / approval doc.
-- ---------------------------------------------------------------------------
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

  SELECT *
    INTO v_req
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
       WHERE id = r_tx.inventory_id;
    ELSE
      UPDATE public.inventory inv
         SET current_qty = inv.current_qty + r_tx.qty,
             available_qty = inv.available_qty + r_tx.qty,
             updated_at = now()
        FROM (
          SELECT id
            FROM public.inventory
           WHERE item_id = r_tx.item_id
             AND lot_no IS NOT DISTINCT FROM r_tx.lot_no
             AND exp_date IS NOT DISTINCT FROM r_tx.exp_date
             AND serial_no IS NOT DISTINCT FROM r_tx.serial_no
           ORDER BY id
           LIMIT 1
        ) pick
       WHERE inv.id = pick.id;
    END IF;

    DELETE FROM public.inventory_transactions WHERE id = r_tx.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_outbound_cancellation(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_outbound_cancellation(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_outbound_cancellation(bigint) TO service_role;
