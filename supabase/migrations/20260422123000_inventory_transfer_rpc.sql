BEGIN;

CREATE OR REPLACE FUNCTION public.execute_inventory_transfer(
  p_source_inventory_id bigint,
  p_to_warehouse_id bigint,
  p_qty numeric,
  p_actor_id uuid,
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.inventory%ROWTYPE;
  v_target public.inventory%ROWTYPE;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(trim(p_remarks), ''), '창고이동');
  v_source_next_current numeric;
  v_source_next_available numeric;
  v_target_inventory_id bigint;
  v_can_relocate boolean;
BEGIN
  IF p_source_inventory_id IS NULL OR p_source_inventory_id <= 0 THEN
    RAISE EXCEPTION '원본 재고 정보가 올바르지 않습니다.';
  END IF;
  IF p_to_warehouse_id IS NULL OR p_to_warehouse_id <= 0 THEN
    RAISE EXCEPTION '도착 창고 정보가 올바르지 않습니다.';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION '이동 수량은 0보다 커야 합니다.';
  END IF;

  SELECT *
    INTO v_source
    FROM public.inventory
   WHERE id = p_source_inventory_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '원본 재고를 찾을 수 없습니다.';
  END IF;

  IF v_source.warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION '출발/도착 창고가 동일합니다.';
  END IF;

  IF coalesce(v_source.current_qty, 0) < p_qty OR coalesce(v_source.available_qty, 0) < p_qty THEN
    RAISE EXCEPTION '출발 창고 재고가 부족합니다.';
  END IF;

  SELECT *
    INTO v_target
    FROM public.inventory
   WHERE item_id = v_source.item_id
     AND warehouse_id = p_to_warehouse_id
     AND lot_no IS NOT DISTINCT FROM v_source.lot_no
     AND exp_date IS NOT DISTINCT FROM v_source.exp_date
     AND serial_no IS NOT DISTINCT FROM v_source.serial_no
   FOR UPDATE;

  v_source_next_current := coalesce(v_source.current_qty, 0) - p_qty;
  v_source_next_available := coalesce(v_source.available_qty, 0) - p_qty;
  v_can_relocate :=
    NOT FOUND
    AND v_source_next_current = 0
    AND v_source_next_available = 0
    AND coalesce(v_source.quarantine_qty, 0) = 0;

  IF v_can_relocate THEN
    UPDATE public.inventory
       SET warehouse_id = p_to_warehouse_id,
           updated_at = v_now
     WHERE id = v_source.id;
    v_target_inventory_id := v_source.id;
  ELSE
    IF FOUND THEN
      UPDATE public.inventory
         SET current_qty = coalesce(current_qty, 0) + p_qty,
             available_qty = coalesce(available_qty, 0) + p_qty,
             updated_at = v_now
       WHERE id = v_target.id;
      v_target_inventory_id := v_target.id;
    ELSE
      BEGIN
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
          v_source.item_id,
          p_to_warehouse_id,
          v_source.lot_no,
          v_source.exp_date,
          v_source.serial_no,
          p_qty,
          p_qty,
          0,
          v_now
        )
        RETURNING id INTO v_target_inventory_id;
      EXCEPTION
        WHEN unique_violation THEN
          RAISE EXCEPTION '현재 재고 추적키 제약으로 부분 이동이 불가합니다. 해당 재고는 전량 이동으로 처리하세요.';
      END;
    END IF;

    UPDATE public.inventory
       SET current_qty = v_source_next_current,
           available_qty = v_source_next_available,
           updated_at = v_now
     WHERE id = v_source.id;
  END IF;

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
    inventory_id,
    warehouse_id
  ) VALUES
  (
    v_source.item_id,
    'OUT',
    p_qty,
    v_source.lot_no,
    v_source.exp_date,
    v_source.serial_no,
    v_note || ' (출발창고)',
    v_now,
    p_actor_id,
    p_actor_id,
    'inventory_transfer',
    v_source.id,
    v_source.id,
    v_source.warehouse_id
  ),
  (
    v_source.item_id,
    'IN',
    p_qty,
    v_source.lot_no,
    v_source.exp_date,
    v_source.serial_no,
    v_note || ' (도착창고)',
    v_now,
    p_actor_id,
    p_actor_id,
    'inventory_transfer',
    v_source.id,
    v_target_inventory_id,
    p_to_warehouse_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'source_inventory_id', v_source.id,
    'target_inventory_id', v_target_inventory_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_inventory_transfer(bigint, bigint, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_inventory_transfer(bigint, bigint, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_inventory_transfer(bigint, bigint, numeric, uuid, text) TO service_role;

COMMIT;
