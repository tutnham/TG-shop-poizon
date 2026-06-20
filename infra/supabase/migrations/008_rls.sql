-- Row Level Security: defense-in-depth for direct PostgREST access.
-- Backend uses service_role key and bypasses RLS; anon/authenticated are restricted.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- Public catalog read for anonymous clients (Mini App catalog via Supabase REST, if used).
CREATE POLICY categories_public_read ON categories
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY products_public_read ON products
  FOR SELECT
  TO anon
  USING (is_available = true);
