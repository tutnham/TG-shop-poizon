# Интеграция Poizon API (poparce.ru) в Telegram Mini App

Провайдер: **Poparce** (https://poparce.ru) — сторонний сервис, проксирующий данные Dewu/Poizon.  
API Base URL: `https://poparce.ru/api/dewu`  
OpenAPI JSON: `https://poparce.ru/api/dewu/api-json`  
Аутентификация: заголовок `x-api-key`

---

## Шаг 1: Регистрация и получение API-ключа

1. Зарегистрируйтесь на https://poparce.ru/authorization/reg
2. В личном кабинете (https://poparce.ru/lk) перейдите в раздел API → сгенерируйте ключ
3. Сохраните ключ в `.env` файл проекта:

```bash
# apps/api/.env
POIZON_API_KEY=ваш_ключ_здесь
POIZON_API_BASE_URL=https://poparce.ru/api/dewu
```

**Тарифы (актуальны на 2026-06):**

| Тариф | Цена | RPS | Запросов/месяц |
|-------|------|-----|----------------|
| Бесплатный | 0 ₽ | — | Только доступ к документации |
| Базовый | 7 500 ₽/мес (акция) | 1 | 10 000 |
| Стандартный | 19 010 ₽/мес | 1 | 30 000 |
| Профессиональный | 29 021 ₽/мес | 2 | 100 000 |

Для MVP подойдёт **Базовый** тариф. При 1 RPS и кэшировании хватит на ~333 уникальных товаров в день без повторных запросов.

---

## Шаг 2: Создание PoisonService в проекте

Файл: `apps/api/src/services/poison.service.ts`

```typescript
import { Env } from '../types/env'

const BASE_URL = process.env.POIZON_API_BASE_URL ?? 'https://poparce.ru/api/dewu'
const API_KEY = process.env.POIZON_API_KEY ?? ''

// Базовый fetch-обёртка с авторизацией
async function poisonFetch<T>(
  path: string,
  params?: Record<string, string | number>,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)

  if (params && method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    throw new Error(`Poizon API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

// --- Типы (минимальный набор для магазина) ---

export interface ProductDetail {
  detail: {
    spuId: number
    title: string
    subTitle: string
    logoUrl: string
    articleNumber: string
    categoryName: string
    soldCountText: string
    status: number // 0 = нет в наличии, 1 = в наличии
  }
  price: {
    item: {
      price: number       // цена в юанях (CNY), в фэнях: делить на 100
      floorPrice: number
      skuId: number
    }
  }
  image: {
    spuImage: {
      images: Array<{ url: string; imgType: number }>
    }
  }
}

export interface PriceInfo {
  [skuId: string]: {
    quantity: number
    prices: Array<{
      price: number
      skuId: number
      type: number
    }>
  }
}

export interface SearchResult {
  spuList: Array<{
    spuId: number
    title: string
    logoUrl: string
    price: number
    soldCountText: string
  }>
  hasMore: boolean
  total: number
}

export interface Category {
  id: number
  name: string
  children?: Category[]
}

// --- Методы сервиса ---

/**
 * Получить детали товара + цены за один запрос.
 * Использует /productDetailWithPrice (1 запрос вместо 2).
 */
export async function getProductDetailWithPrice(spuId: number): Promise<ProductDetail> {
  return poisonFetch<ProductDetail>('/productDetailWithPrice', { spuId })
}

/**
 * Получить только информацию о ценах по spuId.
 * Дешевле по квоте, если детали уже есть в кэше.
 */
export async function getPriceInfo(spuId: number): Promise<PriceInfo> {
  return poisonFetch<PriceInfo>('/priceInfo', { spuId })
}

/**
 * Поиск товаров по ключевому слову.
 * limit: 1–100, page: от 0
 */
export async function searchProducts(
  keyword: string,
  limit = 20,
  page = 0
): Promise<SearchResult> {
  return poisonFetch<SearchResult>('/searchProducts', { keyword, limit, page })
}

/**
 * Получить категории. lang: 'RU' | 'EN' | 'ZH'
 */
export async function getCategories(lang: 'RU' | 'EN' | 'ZH' = 'RU'): Promise<Category[]> {
  return poisonFetch<Category[]>('/getCategories', { lang })
}

/**
 * Batch: первичные данные о нескольких товарах сразу (экономит квоту).
 * Максимум — уточняйте в документации провайдера.
 */
export async function getSimpleProductsDetail(spuIds: number[]) {
  return poisonFetch('/productsDetailSimple', undefined, 'POST', { spuIds })
}

/**
 * Конвертировать ссылку из приложения Poizon → spuId
 */
export async function convertLinkToSpuId(link: string) {
  return poisonFetch<{ spuId: number; skuId: number; url: string }>(
    '/convertLinkToSpuId',
    { link }
  )
}
```

---

## Шаг 3: Кэширование (обязательно при тарифе 1 RPS)

Файл: `apps/api/src/services/cache.service.ts`

```typescript
// In-memory кэш с TTL. В продакшене заменить на Redis через Supabase или upstash.
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 })
}

// Обёртка для автоматического кэширования
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(key)
  if (cached !== null) return cached

  const data = await fetcher()
  cacheSet(key, data, ttlSeconds)
  return data
}
```

Использование в роутах:

```typescript
import { withCache } from './cache.service'
import { getProductDetailWithPrice } from './poison.service'

// TTL 30 минут для деталей товара
const product = await withCache(
  `product:${spuId}`,
  30 * 60,
  () => getProductDetailWithPrice(spuId)
)
```

**Рекомендуемые TTL:**

| Данные | TTL |
|--------|-----|
| Детали товара (название, фото) | 60 мин |
| Цены и наличие | 10 мин |
| Категории | 24 часа |
| Результаты поиска | 15 мин |

---

## Шаг 4: Расчёт цен с наценкой

Файл: `apps/api/src/services/pricing.service.ts`

```typescript
// Курс CNY/RUB получаем из ЦБ РФ или храним в Supabase (обновление раз в час)
// Курс CNY/USDT — через Binance API или фиксированный коэффициент

interface PricingConfig {
  cnuToRubRate: number    // например: 13.5
  markupPercent: number   // например: 30 (30%)
  deliveryRubFixed: number // фиксированная стоимость доставки в RUB
}

/**
 * price из API приходит в ФЭНЯХ (fen). 1 юань = 100 фэней.
 * Конвертируем: fen / 100 = CNY
 */
export function calculatePrice(
  priceInFen: number,
  config: PricingConfig
): { rub: number; usdt: number } {
  const cny = priceInFen / 100
  const rubBase = cny * config.cnuToRubRate
  const rubWithMarkup = rubBase * (1 + config.markupPercent / 100) + config.deliveryRubFixed

  // USDT ≈ CNY / 7.25 (курс CNY/USD) — уточняйте актуальный курс
  const usdtBase = cny / 7.25
  const usdtWithMarkup = usdtBase * (1 + config.markupPercent / 100)

  return {
    rub: Math.ceil(rubWithMarkup / 10) * 10, // округление до 10 рублей
    usdt: Math.ceil(usdtWithMarkup * 10) / 10, // округление до 0.1 USDT
  }
}
```

---

## Шаг 5: Hono-роут для магазина

Файл: `apps/api/src/routes/products.ts`

```typescript
import { Hono } from 'hono'
import { withCache } from '../services/cache.service'
import { getProductDetailWithPrice, searchProducts, getCategories } from '../services/poison.service'
import { calculatePrice } from '../services/pricing.service'

export const productsRouter = new Hono()

// GET /api/products/search?q=nike&limit=20&page=0
productsRouter.get('/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const limit = Number(c.req.query('limit') ?? 20)
  const page = Number(c.req.query('page') ?? 0)

  if (!q) return c.json({ error: 'query required' }, 400)

  const results = await withCache(
    `search:${q}:${limit}:${page}`,
    15 * 60,
    () => searchProducts(q, limit, page)
  )

  return c.json(results)
})

// GET /api/products/:spuId
productsRouter.get('/:spuId', async (c) => {
  const spuId = Number(c.req.param('spuId'))
  if (isNaN(spuId)) return c.json({ error: 'invalid spuId' }, 400)

  const raw = await withCache(
    `product:${spuId}`,
    30 * 60,
    () => getProductDetailWithPrice(spuId)
  )

  // Применяем наценку (конфиг берём из env или Supabase)
  const pricingConfig = {
    cnuToRubRate: Number(process.env.CNY_TO_RUB_RATE ?? 13.5),
    markupPercent: Number(process.env.MARKUP_PERCENT ?? 30),
    deliveryRubFixed: Number(process.env.DELIVERY_RUB ?? 500),
  }

  const prices = calculatePrice(raw.price.item.price, pricingConfig)

  return c.json({
    spuId: raw.detail.spuId,
    title: raw.detail.title,
    logoUrl: raw.detail.logoUrl,
    articleNumber: raw.detail.articleNumber,
    inStock: raw.detail.status === 1,
    images: raw.image.spuImage.images.map((i) => i.url),
    price: {
      originalFen: raw.price.item.price,
      rub: prices.rub,
      usdt: prices.usdt,
    },
  })
})

// GET /api/products/categories
productsRouter.get('/categories', async (c) => {
  const categories = await withCache('categories:RU', 24 * 60 * 60, () => getCategories('RU'))
  return c.json(categories)
})
```

---

## Шаг 6: Переменные окружения (.env.example)

```bash
# Poizon API
POIZON_API_KEY=
POIZON_API_BASE_URL=https://poparce.ru/api/dewu

# Курсы валют (обновлять через cron каждый час)
CNY_TO_RUB_RATE=13.5
CNY_TO_USD_RATE=7.25

# Ценообразование
MARKUP_PERCENT=30
DELIVERY_RUB=500

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Telegram
SHOP_BOT_TOKEN=
ADMIN_BOT_TOKEN=
```

---

## Шаг 7: Проверка работоспособности (curl)

```bash
# Проверка поиска
curl -H "x-api-key: ВАШ_КЛЮЧ" \
  "https://poparce.ru/api/dewu/searchProducts?keyword=nike&limit=5&page=0"

# Проверка детального запроса (spuId — реальный ID с Poizon)
curl -H "x-api-key: ВАШ_КЛЮЧ" \
  "https://poparce.ru/api/dewu/productDetailWithPrice?spuId=12345678"

# Получить категории
curl -H "x-api-key: ВАШ_КЛЮЧ" \
  "https://poparce.ru/api/dewu/getCategories?lang=RU"
```

---

## Известные ограничения

| Ограничение | Описание |
|-------------|----------|
| RPS | 1 запрос/сек на Базовом тарифе — **обязательно кэширование** |
| Квота | 10 000 запросов/мес на Базовом — при 333 товарах/день с кэшем 30 мин хватает |
| Цены в фэнях | `price` возвращается в фэнях (1 CNY = 100 fen), делить на 100 перед расчётом |
| Статус товара | `detail.status === 1` — в наличии. Прочие значения = нет в наличии |
| Изображения | CDN Poizon/Dewu — могут блокироваться. Рассмотреть проксирование через свой сервер |
| Официального API нет | poparce.ru — сторонний агрегатор. Возможна нестабильность при обновлениях Dewu |

