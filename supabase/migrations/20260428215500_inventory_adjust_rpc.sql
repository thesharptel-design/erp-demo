BEGIN;

CREATE OR REPLACE FUNCTION public.execute_inventory_adjust(
  p_item_id bigint,
  p_warehouse_id bigint,
  p_adjustment_type text,
  p_qty numeric,
  p_actor_id uuid,
  p_remarks text,
  p_lot_no text DEFAULT NULL,
  p_exp_date date DEFAULT NULL,
  p_serial_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_inventory public.inventory%ROWTYPE;
  v_inventory_id bigint;
  v_current_qty numeric := 0;
  v_available_qty numeric := 0;
  v_quarantine_qty numeric := 0;
  v_next_current_qty numeric := 0;
  v_next_available_qty numeric := 0;
  v_next_quarantine_qty numeric := 0;
  v_lot_no text := nullif(trim(coalesce(p_lot_no, '')), '');
  v_serial_no text := nullif(trim(coalesce(p_serial_no, '')), '');
  v_remarks text := trim(coalesce(p_remarks, ''));
  v_adjust_label text;
BEGIN
  IF p_item_id IS NULL OR p_item_id <= 0 THEN
    RAISE EXCEPTION '조정 대상 품목이 올바르지 않습니다.';
  END IF;
  IF p_warehouse_id IS NULL OR p_warehouse_id <= 0 THEN
    RAISE EXCEPTION '조정 대상 창고가 올바르지 않습니다.';
  END IF;
  IF p_adjustment_type IS NULL OR p_adjustment_type NOT IN (
    'available_increase',
    'available_decrease',
    'quarantine_increase',
    'quarantine_decrease'
  ) THEN
    RAISE EXCEPTION '조정 유형이 올바르지 않습니다.';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION '조정 수량은 0보다 커야 합니다.';
  END IF;
  IF v_remarks = '' THEN
    RAISE EXCEPTION '조정 사유를 입력하십시오.';
  END IF;

  SELECT *
    INTO v_inventory
    FROM public.inventory
   WHERE item_id = p_item_id
     AND warehouse_id = p_warehouse_id
     AND lot_no IS NOT DISTINCT FROM v_lot_no
     AND exp_date IS NOT DISTINCT FROM p_exp_date
     AND serial_no IS NOT DISTINCT FROM v_serial_no
   FOR UPDATE;

  IF FOUND THEN
    v_inventory_id := v_inventory.id;
    v_current_qty := coalesce(v_inventory.current_qty, 0);
    v_available_qty := coalesce(v_inventory.available_qty, 0);
    v_quarantine_qty := coalesce(v_inventory.quarantine_qty, 0);
  END IF;

  v_next_current_qty := v_current_qty;
  v_next_available_qty := v_available_qty;
  v_next_quarantine_qty := v_quarantine_qty;

  CASE p_adjustment_type
    WHEN 'available_increase' THEN
      v_next_current_qty := v_next_current_qty + p_qty;
      v_next_available_qty := v_next_available_qty + p_qty;
      v_adjust_label := '사용가능재고 증가';
    WHEN 'available_decrease' THEN
      IF v_available_qty < p_qty OR v_current_qty < p_qty THEN
        RAISE EXCEPTION '사용가능재고가 부족합니다.';
      END IF;
      v_next_current_qty := v_next_current_qty - p_qty;
      v_next_available_qty := v_next_available_qty - p_qty;
      v_adjust_label := '사용가능재고 감소';
    WHEN 'quarantine_increase' THEN
      v_next_current_qty := v_next_current_qty + p_qty;
      v_next_quarantine_qty := v_next_quarantine_qty + p_qty;
      v_adjust_label := '격리재고 증가';
    WHEN 'quarantine_decrease' THEN
      IF v_quarantine_qty < p_qty OR v_current_qty < p_qty THEN
        RAISE EXCEPTION '격리재고가 부족합니다.';
      END IF;
      v_next_current_qty := v_next_current_qty - p_qty;
      v_next_quarantine_qty := v_next_quarantine_qty - p_qty;
      v_adjust_label := '격리재고 감소';
  END CASE;

  IF v_inventory_id IS NULL THEN
    INSERT INTO public.inventory (
      item_id,
      warehouse_id,
      lot_no,
      exp_date,
      serial_no,
      current_qty,
      available_qty,
      quarantine_qty,
      updated_at
    ) VALUES (
      p_item_id,
      p_warehouse_id,
      v_lot_no,
      p_exp_date,
      v_serial_no,
      v_next_current_qty,
      v_next_available_qty,
      v_next_quarantine_qty,
      v_now
    )
    RETURNING id INTO v_inventory_id;
  ELSE
    UPDATE public.inventory
       SET current_qty = v_next_current_qty,
           available_qty = v_next_available_qty,
           quarantine_qty = v_next_quarantine_qty,
           updated_at = v_now
     WHERE id = v_inventory_id;
  END IF;

  INSERT INTO public.inventory_transactions (
    trans_date,
    trans_type,
    item_id,
    qty,
    warehouse_id,
    inventory_id,
    lot_no,
    exp_date,
    serial_no,
    ref_table,
    ref_id,
    remarks,
    created_by,
    created_at
  ) VALUES (
    v_now,
    'ADJUST',
    p_item_id,
    p_qty,
    p_warehouse_id,
    v_inventory_id,
    v_lot_no,
    p_exp_date,
    v_serial_no,
    'inventory_adjustments',
    NULL,
    '[' || v_adjust_label || '] ' || v_remarks,
    p_actor_id,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotency_status', 'processed',
    'inventory_id', v_inventory_id,
    'current_qty', v_next_current_qty,
    'available_qty', v_next_available_qty,
    'quarantine_qty', v_next_quarantine_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_inventory_adjust(bigint, bigint, text, numeric, uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_inventory_adjust(bigint, bigint, text, numeric, uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_inventory_adjust(bigint, bigint, text, numeric, uuid, text, text, date, text) TO service_role;

COMMIT;
