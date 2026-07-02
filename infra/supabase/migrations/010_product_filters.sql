-- Product catalog filters: gender + size (JSONB stock)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gender TEXT;

COMMENT ON COLUMN products.gender IS 'Normalized wearer gender: male, female, unisex, kids, unknown';

CREATE INDEX IF NOT EXISTS idx_products_gender_available
  ON products (gender)
  WHERE is_available = TRUE AND gender IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_stock_gin
  ON products USING GIN (stock jsonb_path_ops)
  WHERE is_available = TRUE;
