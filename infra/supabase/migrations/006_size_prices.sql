-- Per-size prices for products (size label -> { cny, rub, usdt })

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS size_prices JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN products.size_prices IS
  'Map of size label to { cny, rub, usdt }. Scalar price_* columns store min available size price.';
