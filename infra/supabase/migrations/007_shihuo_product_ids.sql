-- Shihuo (Poparce) external product mapping for article-based price backfill

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shihuo_goods_id TEXT,
  ADD COLUMN IF NOT EXISTS shihuo_style_id TEXT;

COMMENT ON COLUMN products.shihuo_goods_id IS
  'Shihuo goodsId from poparce.ru/api/shihuo search/price chain';

COMMENT ON COLUMN products.shihuo_style_id IS
  'Shihuo styleId paired with shihuo_goods_id for price fetch';

CREATE INDEX IF NOT EXISTS idx_products_shihuo_goods_id
  ON products (shihuo_goods_id)
  WHERE shihuo_goods_id IS NOT NULL;
