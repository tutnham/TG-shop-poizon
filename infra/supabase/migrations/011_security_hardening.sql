-- 011: Security hardening — RPC privileges + stricter public products RLS

-- Restrict create_shop_order to service_role only (backend uses service_role key).
-- RLS does NOT protect functions; explicit REVOKE/GRANT required per Supabase docs.
REVOKE ALL ON FUNCTION create_shop_order(
  UUID, JSONB, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, JSONB
) FROM PUBLIC;

REVOKE ALL ON FUNCTION create_shop_order(
  UUID, JSONB, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, JSONB
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION create_shop_order(
  UUID, JSONB, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, JSONB
) TO service_role;

-- Align anon SELECT policy with app catalog visibility:
-- is_available, price_rub > 0, gender in (male, female, null)
DROP POLICY IF EXISTS products_public_read ON products;

CREATE POLICY products_public_read ON products
  FOR SELECT
  TO anon
  USING (
    is_available = TRUE
    AND price_rub > 0
    AND (
      gender IS NULL
      OR gender IN ('male', 'female')
    )
  );
