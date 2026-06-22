-- 009: Atomic order creation (order + optional payment + cart clear)

CREATE OR REPLACE FUNCTION create_shop_order(
  p_user_id UUID,
  p_items JSONB,
  p_total_rub NUMERIC,
  p_total_usdt NUMERIC,
  p_payment_method TEXT,
  p_delivery_info JSONB,
  p_short_id TEXT,
  p_payment JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  INSERT INTO orders (
    user_id,
    items,
    total_rub,
    total_usdt,
    payment_method,
    delivery_info,
    status,
    short_id
  )
  VALUES (
    p_user_id,
    p_items,
    p_total_rub,
    p_total_usdt,
    p_payment_method,
    p_delivery_info,
    'pending',
    p_short_id
  )
  RETURNING id INTO v_order_id;

  IF p_payment IS NOT NULL THEN
    INSERT INTO payments (
      order_id,
      method,
      status,
      amount_display,
      amount_ton,
      wallet_comment
    )
    VALUES (
      v_order_id,
      p_payment->>'method',
      'pending',
      (p_payment->>'amount_display')::NUMERIC,
      CASE
        WHEN p_payment ? 'amount_ton' THEN (p_payment->>'amount_ton')::NUMERIC
        ELSE NULL
      END,
      p_payment->>'wallet_comment'
    );
  END IF;

  DELETE FROM cart_items WHERE user_id = p_user_id;

  RETURN jsonb_build_object('id', v_order_id, 'short_id', p_short_id);
END;
$$;
