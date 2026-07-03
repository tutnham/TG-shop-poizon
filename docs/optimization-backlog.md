# Backlog оптимизации и hardening

Документ фиксирует приоритетные улучшения после архитектурного аудита (2026-07).

## Высокий приоритет

### 1. Распределённый rate limit

**Проблема:** `mutation-rate-limit`, `import-rate-limit`, `webhookRateLimit` хранят счётчики в `Map` внутри процесса. На Vercel serverless каждый cold start сбрасывает лимиты; несколько инстансов не делят state.

**Файлы:** `apps/api/src/middleware/mutation-rate-limit.ts`, `import-rate-limit.ts`, `webhook.middleware.ts`

**Решение:** Upstash Redis или Vercel KV с ключами `rate:{type}:{userId|ip}` и TTL.

**Effort:** 1–2 дня | **Risk:** низкий | **Impact:** высокий для anti-abuse

### 2. Cursor pagination каталога

**Проблема:** `product.repository.ts` использует offset через `.range(from, from + limit - 1)`. На глубоких страницах Postgres сканирует все пропущенные строки.

**Решение:** Keyset pagination по `(sold_count DESC, id DESC)` — индекс `idx_products_keyset` уже есть в `004_perf_indexes.sql`.

**Effort:** 1 день API + 0.5 дня webapp | **Impact:** высокий при каталоге >5k SKU

## Средний приоритет

### 3. SQL aggregates для фильтров

**Проблема:** `listAvailableSizes`, `listBrands`, `listCategories` загружают все строки и dedupe в Node.

**Решение:** RPC или materialized view с `DISTINCT` / JSONB unnest; кеш 5–15 мин через `publicCache`.

### 4. Image proxy streaming

**Проблема:** `image-proxy.route.ts` буферизует до 5 MB через `arrayBuffer()`.

**Решение:** `ReadableStream` с byte-counter и abort при превышении лимита.

### 5. Webapp bundle diet

**Проблема:** `main.ts` синхронно грузит 3 веса Inter, полный `material-symbols`, ~1500 строк CSS.

**Решение:** system-ui fallback или 400/600 Inter; inline SVG для ~10 иконок; `manualChunks` в Vite.

### 6. Кеш курсов валют

**Проблема:** `InMemoryExchangeRateCacheRepository` не переживает cold start.

**Решение:** тот же KV/Redis, что и для rate limits.

## Низкий приоритет

### 7. Replace-import orchestrator

Единый CLI `replace-from-export.ts`: dry-run → upsert → purge в одной транзакции/отчёте.

### 8. Orphan categories cleanup

RPC или скрипт удаления категорий без товаров (с учётом FK).

### 9. Webapp e2e

Playwright smoke: home filters, cart add, checkout happy path.

### 10. Import admin-only

Перенести `POST /api/products/import` в admin route или проверять whitelist.

## Мониторинг

- `GET /health` — `rates_stale`, `last_rates_at`
- После replace-импорта: `EXPLAIN ANALYZE` на `GET /api/products?size=...` с GIN из `010_product_filters.sql`
- Vercel Function logs: cold start frequency, p95 latency на `/api/products`
