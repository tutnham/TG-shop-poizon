-- 004_perf_indexes.sql
-- Индексы для производительной работы с 9000+ товаров

-- Составной индекс для основного запроса: фильтрация по доступности + сортировка по продажам
-- Покрывает: WHERE is_available = true ORDER BY sold_count DESC
CREATE INDEX IF NOT EXISTS idx_products_avail_sold
  ON products (is_available, sold_count DESC)
  WHERE is_available = TRUE;

-- Индекс для сортировки по цене (price_asc / price_desc)
CREATE INDEX IF NOT EXISTS idx_products_avail_price
  ON products (is_available, price_rub)
  WHERE is_available = TRUE;

-- Индекс для сортировки по дате добавления (новинки)
CREATE INDEX IF NOT EXISTS idx_products_avail_created
  ON products (is_available, created_at DESC)
  WHERE is_available = TRUE;

-- Индекс для полнотекстового поиска по названию (латиница)
-- Используется в: name.ilike.%term% OR name_ru.ilike.%term%
-- pg_trgm позволяет эффективный LIKE '%term%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops)
  WHERE is_available = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_name_ru_trgm
  ON products USING gin (COALESCE(name_ru, '') gin_trgm_ops)
  WHERE is_available = TRUE;

-- Индекс для бренда (ilike search)
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON products USING gin (COALESCE(brand, '') gin_trgm_ops)
  WHERE is_available = TRUE;

-- Составной индекс для пагинации с keyset (будущее использование)
-- Позволяет эффективный cursor-based pagination: WHERE (sold_count, id) < ($last_sold, $last_id)
CREATE INDEX IF NOT EXISTS idx_products_keyset
  ON products (sold_count DESC, id DESC)
  WHERE is_available = TRUE;
