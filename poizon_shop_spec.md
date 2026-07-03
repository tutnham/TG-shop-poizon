# Spec-First документация: Telegram Mini App — Магазин на базе Poizon

> **Historical draft.** Этот документ описывает первоначальную spec (Bun, self-hosted Supabase, docker-compose).
> Актуальная архитектура и инструкции — в [README.md](README.md) и [docs/deploy-vercel.md](docs/deploy-vercel.md).

**Версия:** 1.0  
**Дата:** 2026-06-01  
**Стек (устарело):** TypeScript · Hono · Bun · Supabase (self-hosted) · Telegram Bot API

---

## 1. Обзор проекта

Telegram Mini App — интернет-магазин кроссовок, одежды и аксессуаров, работающий как посредник на базе китайской платформы Poizon (DEWU). Товары автоматически подтягиваются через Poizon API. Цены отображаются в рублях (с настраиваемой наценкой) и USDT. Управление магазином осуществляется через отдельный Telegram-бот для администратора.

### 1.1 Ответ на вопрос об архитектуре

Да, нужно два Telegram-бота:

| Бот | Назначение | Тип интерфейса |
|-----|-----------|----------------|
| **Shop Bot** (`@yourshop_bot`) | Клиентский магазин | Telegram Mini App (WebApp) |
| **Admin Bot** (`@yourshop_admin_bot`) | Управление магазином для владельца | Telegram Bot с inline-клавиатурой / командами |

Это стандартная практика: Mini App требует отдельного бота, к которому прикреплён WebApp. Смешивать клиентский и административный боты не рекомендуется по соображениям безопасности и UX.

Что ты не упустил, но стоит явно зафиксировать:
- **Webhook-сервер** — единый Hono-сервер обрабатывает webhook для обоих ботов на разных маршрутах.
- **Poizon API integration** — парсинг/API Poizon требует изучения доступности эндпоинтов (официального публичного API нет; используется reverse-engineered API или сторонние поставщики данных).
- **Курс валют** — нужен внешний источник курса CNY→RUB и CNY→USDT для автоматического пересчёта цен.
- **Платёжный шлюз** — интеграция с платёжной системой (Telegram Stars, YooKassa, криптоплатёж) не входит в первую версию, но должна быть предусмотрена в архитектуре.

---

## 2. Архитектура системы

```
┌─────────────────────────────────────────────────────────────────┐
│                        Telegram Servers                          │
│   Shop Bot webhook         Admin Bot webhook                     │
│   /webhook/shop            /webhook/admin                        │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hono API Server (Bun)                         │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐    │
│  │  Shop WebApp    │    │  Admin Bot Handler               │    │
│  │  /api/products  │    │  /webhook/admin                  │    │
│  │  /api/product/  │    │                                  │    │
│  │  /api/cart      │    │                                  │    │
│  │  /api/orders    │    │                                  │    │
│  └────────┬────────┘    └───────────────┬──────────────────┘    │
│           │                             │                        │
│  ┌────────▼─────────────────────────────▼──────────────────┐    │
│  │              Business Logic Layer                        │    │
│  │  ProductService · OrderService · PricingService          │    │
│  │  PoisonSyncService · CurrencyService                     │    │
│  └────────┬─────────────────────────────────────────────────┘    │
│           │                                                      │
│  ┌────────▼──────────────┐    ┌─────────────────────────────┐   │
│  │  Supabase (self-host) │    │  Poizon API / Scraper        │   │
│  │  PostgreSQL + Auth    │    │  (внешний источник данных)   │   │
│  │  Realtime + Storage   │    └─────────────────────────────┘   │
│  └───────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Структура репозитория

```
poizon-shop/
├── apps/
│   ├── api/                         # Hono-сервер (Bun)
│   │   ├── src/
│   │   │   ├── index.ts             # Entry point, Hono app
│   │   │   ├── routes/
│   │   │   │   ├── shop.ts          # REST API для Mini App
│   │   │   │   ├── webhooks.ts      # Webhook-обработчики обоих ботов
│   │   │   │   └── admin.ts         # REST API для Admin панели
│   │   │   ├── services/
│   │   │   │   ├── product.service.ts
│   │   │   │   ├── order.service.ts
│   │   │   │   ├── pricing.service.ts
│   │   │   │   ├── poizon.service.ts
│   │   │   │   └── currency.service.ts
│   │   │   ├── bots/
│   │   │   │   ├── shop.bot.ts      # Shop Bot (Mini App launcher)
│   │   │   │   └── admin.bot.ts     # Admin Bot handler
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts          # TMA init data validation
│   │   │   │   └── admin-auth.ts    # Admin Telegram ID whitelist
│   │   │   └── db/
│   │   │       ├── client.ts        # Supabase client
│   │   │       └── migrations/      # SQL-миграции
│   │   ├── package.json
│   │   └── bunfig.toml
│   └── webapp/                      # Telegram Mini App (Frontend)
│       ├── src/
│       │   ├── main.ts
│       │   ├── pages/
│       │   │   ├── Home.ts          # Главная с каталогом
│       │   │   ├── Product.ts       # Карточка товара
│       │   │   ├── Cart.ts          # Корзина
│       │   │   └── Orders.ts        # История заказов
│       │   ├── components/
│       │   └── store/               # State management
│       └── package.json
├── packages/
│   └── shared/                      # Общие типы TypeScript
│       └── src/types/
│           ├── product.ts
│           ├── order.ts
│           └── api.ts
├── infra/
│   ├── docker-compose.yml           # Supabase self-hosted
│   └── nginx.conf
├── .env.example
└── package.json                     # Workspaces root
```

---

## 3. База данных (Supabase / PostgreSQL)

### 3.1 Схема таблиц

```sql
-- Категории товаров
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ru     TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   UUID REFERENCES categories(id),
  poizon_id   TEXT,                    -- ID категории на Poizon
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Товары (синхронизированные с Poizon)
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poizon_id       TEXT NOT NULL UNIQUE,  -- внешний ID товара на Poizon
  name            TEXT NOT NULL,
  name_ru         TEXT,                  -- переведённое название
  brand           TEXT,
  category_id     UUID REFERENCES categories(id),
  image_urls      TEXT[],
  is_available    BOOLEAN DEFAULT TRUE,
  price_cny       NUMERIC(10,2),         -- базовая цена в CNY с Poizon
  price_rub       NUMERIC(10,2),         -- итоговая цена в RUB (с наценкой)
  price_usdt      NUMERIC(10,4),         -- итоговая цена в USDT
  sizes           JSONB,                 -- {"EU": ["39","40","41"], "US": ["7","8","9"]}
  stock           JSONB,                 -- {"39": true, "40": false}
  sold_count      INTEGER DEFAULT 0,
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Настройки ценообразования
CREATE TABLE pricing_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  markup_percent  NUMERIC(5,2) NOT NULL DEFAULT 25.0,  -- наценка в %
  delivery_fee    NUMERIC(10,2) DEFAULT 0,             -- фикс. доставка в RUB
  currency_pair   TEXT NOT NULL DEFAULT 'CNY_RUB',
  rate            NUMERIC(10,4),                       -- текущий курс
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Пользователи (Telegram)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     BIGINT NOT NULL UNIQUE,
  username        TEXT,
  first_name      TEXT,
  last_name       TEXT,
  language_code   TEXT DEFAULT 'ru',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Корзина
CREATE TABLE cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  size        TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id, size)
);

-- Заказы
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  -- статусы: pending | confirmed | paid | processing | shipped | delivered | cancelled
  items           JSONB NOT NULL,        -- снэпшот товаров на момент заказа
  total_rub       NUMERIC(10,2),
  total_usdt      NUMERIC(10,4),
  payment_method  TEXT,                  -- 'rub' | 'usdt'
  delivery_info   JSONB,                 -- адрес, контакт
  admin_comment   TEXT,
  tracking_number TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Лог синхронизации с Poizon
CREATE TABLE sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL,           -- 'success' | 'error'
  items_synced  INTEGER DEFAULT 0,
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

-- Настройки магазина
CREATE TABLE shop_config (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Примеры записей:
-- ('shop_name', '"Мой Магазин"')
-- ('welcome_message', '"Добро пожаловать!"')
-- ('admin_telegram_ids', '[123456789, 987654321]')
```

### 3.2 Индексы

```sql
CREATE INDEX idx_products_poizon_id ON products(poizon_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_available ON products(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_cart_user ON cart_items(user_id);
```

---

## 4. API Спецификация (Hono Routes)

### 4.1 Shop API (для Mini App)

Все эндпоинты защищены middleware валидации Telegram initData.

```
GET    /api/products                    # Каталог товаров (с фильтрами)
GET    /api/products/:id                # Карточка товара
GET    /api/categories                  # Список категорий

GET    /api/cart                        # Корзина пользователя
POST   /api/cart                        # Добавить товар
PATCH  /api/cart/:itemId                # Обновить количество/размер
DELETE /api/cart/:itemId                # Удалить из корзины

POST   /api/orders                      # Создать заказ
GET    /api/orders                      # История заказов пользователя
GET    /api/orders/:id                  # Детали заказа

GET    /api/config                      # Публичный конфиг магазина (название, баннер)
```

#### GET /api/products — параметры запроса

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `page` | number | 1 | Страница |
| `limit` | number | 20 | Товаров на странице (макс. 50) |
| `category` | string | — | Slug категории |
| `brand` | string | — | Фильтр по бренду |
| `search` | string | — | Полнотекстовый поиск |
| `sort` | string | `popular` | `popular`, `price_asc`, `price_desc`, `new` |
| `min_price` | number | — | Минимальная цена (RUB) |
| `max_price` | number | — | Максимальная цена (RUB) |

#### Пример ответа GET /api/products

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Nike Dunk Low Panda",
      "brand": "Nike",
      "image_url": "https://...",
      "price_rub": 9200,
      "price_usdt": 101.5,
      "is_available": true,
      "sold_count": 1240
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 450,
    "pages": 23
  }
}
```

### 4.2 Admin API

Защищён проверкой Telegram ID администратора.

```
GET    /admin/dashboard                 # Статистика: заказы, выручка
GET    /admin/orders                    # Список заказов с фильтрами
GET    /admin/orders/:id                # Детали заказа
PATCH  /admin/orders/:id/status         # Обновить статус
PATCH  /admin/orders/:id/tracking       # Добавить трек-номер

GET    /admin/products                  # Список товаров
PATCH  /admin/products/:id/visibility   # Показать/скрыть товар
POST   /admin/products/sync             # Запустить синхронизацию с Poizon

GET    /admin/pricing                   # Текущие настройки цен
PATCH  /admin/pricing                   # Обновить наценку, курс

GET    /admin/sync-logs                 # История синхронизаций
GET    /admin/config                    # Настройки магазина
PATCH  /admin/config                    # Обновить настройки
```

### 4.3 Webhooks

```
POST   /webhook/shop                    # Shop Bot webhook
POST   /webhook/admin                   # Admin Bot webhook
```

---

## 5. Telegram Bot Спецификации

### 5.1 Shop Bot

**Цель:** запускать Mini App и сопровождать пользователя.

```
Команды:
/start    → приветственное сообщение + кнопка "Открыть магазин" (WebApp)
/shop     → кнопка открытия Mini App
/orders   → история заказов (deep link в Mini App)
/help     → FAQ

Callback queries:
- open_webapp      → кнопка запуска Mini App
- track_order:{id} → статус заказа

Уведомления (бот сам пишет пользователю):
- Заказ принят
- Заказ подтверждён / оплачен
- Заказ отправлен (с трек-номером)
- Заказ доставлен
```

**Кнопка Mini App** в ответе на /start:
```typescript
{
  reply_markup: {
    keyboard: [[{
      text: "🛍 Открыть магазин",
      web_app: { url: "https://yourdomain.com/webapp" }
    }]],
    resize_keyboard: true
  }
}
```

### 5.2 Admin Bot

**Цель:** управление магазином через чат. Telegram ID владельца прописывается в `shop_config`.

```
Команды:
/start        → главное меню (inline-кнопки)
/orders       → список новых заказов
/stats        → краткая статистика за сегодня/неделю
/sync         → запустить синхронизацию товаров с Poizon
/pricing      → настройки цен и наценки
/config       → настройки магазина

Inline-меню (кнопки):
📦 Новые заказы     → список со статусом 'pending'
📋 Все заказы       → полный список с фильтром
💰 Настройки цен    → изменить наценку %
🔄 Синхронизация    → запуск + статус последней синхронизации
⚙️ Настройки        → имя магазина, сообщения
📊 Статистика       → заказы, выручка, топ товаров

Обработка заказа (шаги через callback):
1. Просмотр деталей заказа
2. Подтвердить заказ (/confirm) → статус: confirmed
3. Отметить оплачен (/paid)     → статус: paid
4. Добавить трек-номер (/track {number})
5. Отметить отправлен           → статус: shipped
   → Bot автоматически уведомляет клиента
```

---

## 6. Сервисы (Business Logic)

### 6.1 PoisonService — интеграция с Poizon

```typescript
// Важно: Poizon не имеет официального публичного API.
// Варианты интеграции:
// 1. Сторонний API-провайдер (например, dewuapi.com или аналоги)
// 2. Reverse-engineered API с ротацией токенов
// 3. Периодический парсинг страниц (менее надёжно)

interface PoisonProduct {
  id: string
  title: string
  brand: string
  categoryId: string
  price: number          // в CNY
  images: string[]
  sizes: Record<string, boolean>  // размер → наличие
  soldCount: number
}

class PoisonService {
  async searchProducts(query: string, categoryId?: string): Promise<PoisonProduct[]>
  async getProduct(poisonId: string): Promise<PoisonProduct>
  async syncCategory(categoryId: string): Promise<void>
  async fullSync(): Promise<SyncResult>
}
```

**Стратегия синхронизации:**
- Полная синхронизация: cron-задача раз в 6 часов
- Инкрементальная (по категориям): каждый час
- Ручной запуск: через Admin Bot `/sync`

### 6.2 PricingService — ценообразование

```typescript
class PricingService {
  // Формула расчёта цены в рублях:
  // price_rub = (price_cny * rate_cny_rub) * (1 + markup/100) + delivery_fee
  
  // Формула расчёта цены в USDT:
  // price_usdt = (price_cny / rate_cny_usd) * (1 + markup/100)
  
  async calculatePrices(priceCny: number): Promise<{ rub: number; usdt: number }>
  async updateRates(): Promise<void>  // обновление курса через внешний API
  async setMarkup(percent: number): Promise<void>
}
```

**Источники курсов валют:**
- Основной: ЦБ РФ API (`https://www.cbr.ru/scripts/XML_daily.asp`)
- USDT/CNY: Binance P2P API или CoinGecko

### 6.3 CurrencyService

```typescript
class CurrencyService {
  async getRate(from: Currency, to: Currency): Promise<number>
  async refreshRates(): Promise<void>  // кэш 1 час
}
```

---

## 7. Middleware — Безопасность

### 7.1 Валидация Telegram initData (TMA Auth)

Все API-запросы от Mini App должны содержать заголовок `X-Telegram-Init-Data` с данными initData от Telegram WebApp. Сервер проверяет HMAC-подпись по Bot Token.

```typescript
// middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import { createHmac } from 'crypto'

export const tmaAuth = createMiddleware(async (c, next) => {
  const initData = c.req.header('X-Telegram-Init-Data')
  if (!initData) return c.json({ error: 'Unauthorized' }, 401)
  
  const isValid = validateInitData(initData, process.env.SHOP_BOT_TOKEN!)
  if (!isValid) return c.json({ error: 'Invalid initData' }, 403)
  
  const user = parseUser(initData)
  c.set('telegramUser', user)
  await next()
})

function validateInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')
  
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken).digest()
  
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString).digest('hex')
  
  return expectedHash === hash
}
```

### 7.2 Admin Auth

```typescript
// middleware/admin-auth.ts
export const adminAuth = createMiddleware(async (c, next) => {
  // Для Admin Bot webhook — проверяем Telegram ID отправителя
  // Список ID хранится в shop_config['admin_telegram_ids']
  const adminIds = await getAdminIds()  // из Supabase
  const senderId = c.get('telegramUserId')
  
  if (!adminIds.includes(senderId)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
```

---

## 8. Frontend — Telegram Mini App

### 8.1 Технологический выбор

| Аспект | Выбор | Причина |
|--------|-------|---------|
| Фреймворк | Vanilla TS + Vite | Минимальный bundle для TMA |
| Стили | CSS Variables + темная тема | Нативная поддержка Telegram темы |
| State | Zustand (минимальный) | Прост в использовании без оверхеда |
| Иконки | Lucide Icons (tree-shaking) | Легковесно |
| HTTP | `fetch` + типизированный клиент | Нет зависимостей |

### 8.2 Страницы Mini App

```
/ (Home)
├── Шапка с поиском
├── Категории (горизонтальный скролл)
├── Баннер акции (опционально)
└── Сетка товаров (infinite scroll)

/product/:id
├── Слайдер фотографий
├── Название, бренд
├── Цена в RUB и USDT
├── Выбор размера (кнопки)
├── Наличие по размеру
└── Кнопка "В корзину" (MainButton Telegram)

/cart
├── Список товаров
├── Итоговая сумма (RUB и USDT)
└── Кнопка "Оформить заказ" (MainButton)

/checkout
├── Форма доставки
└── Выбор способа оплаты (RUB / USDT)

/orders
└── История заказов с статусами
```

### 8.3 Тема (Dark Mode)

Mini App использует CSS-переменные Telegram и принудительную тёмную тему:

```typescript
// main.ts — инициализация
const tg = window.Telegram.WebApp
tg.ready()
tg.expand()
tg.setHeaderColor('#0f0f0f')
tg.setBackgroundColor('#0f0f0f')

// Цветовая схема (темная)
:root {
  --tg-theme-bg-color: #0f0f0f;
  --tg-theme-secondary-bg-color: #1a1a1a;
  --tg-theme-text-color: #e8e8e8;
  --tg-theme-hint-color: #7a7a7a;
  --tg-theme-link-color: #4f98a3;
  --tg-theme-button-color: #4f98a3;
  --tg-theme-button-text-color: #ffffff;
  
  /* Кастомные переменные магазина */
  --color-surface: #1c1b19;
  --color-surface-2: #252422;
  --color-accent: #4f98a3;
  --color-price: #6daa45;
  --color-price-usdt: #e8af34;
}
```

---

## 9. Инфраструктура

### 9.1 Supabase Self-Hosted (Docker Compose)

```yaml
# infra/docker-compose.yml
version: '3.8'
services:
  supabase-db:
    image: supabase/postgres:15.1.0.55
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  supabase-api:
    image: supabase/gotrue:v2.99.0
    environment:
      GOTRUE_DB_DRIVER: postgres
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres
      API_EXTERNAL_URL: ${SUPABASE_URL}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}

  supabase-storage:
    image: supabase/storage-api:v0.46.4
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres
      ANON_KEY: ${SUPABASE_ANON_KEY}
      SERVICE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}

volumes:
  pgdata:
```

### 9.2 Переменные окружения

```bash
# .env.example

# Telegram Bots
SHOP_BOT_TOKEN=           # токен Shop Bot (от @BotFather)
ADMIN_BOT_TOKEN=          # токен Admin Bot (от @BotFather)
WEBHOOK_SECRET=           # секрет для верификации webhook

# Server
PORT=3000
WEBAPP_URL=               # https://yourdomain.com/webapp

# Supabase
SUPABASE_URL=             # http://localhost:8000
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POSTGRES_PASSWORD=

# Poizon Integration
POIZON_API_URL=           # URL стороннего провайдера или своего API
POIZON_API_KEY=           # ключ доступа

# Currency
CBR_API_URL=https://www.cbr.ru/scripts/XML_daily.asp

# Security
JWT_SECRET=               # минимум 32 символа
ADMIN_TELEGRAM_IDS=       # через запятую: 123456789,987654321
```

### 9.3 Nginx конфигурация

```nginx
# infra/nginx.conf
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # TLS (certbot/Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Mini App (статика)
    location /webapp {
        root /var/www/poizon-shop;
        try_files $uri $uri/ /webapp/index.html;
    }

    # API сервер (Hono)
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Webhooks
    location /webhook {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

---

## 10. Регистрация webhook

После деплоя необходимо зарегистрировать webhook для обоих ботов:

```bash
# Shop Bot
curl -X POST "https://api.telegram.org/bot${SHOP_BOT_TOKEN}/setWebhook" \
  -d "url=https://yourdomain.com/webhook/shop" \
  -d "secret_token=${WEBHOOK_SECRET}"

# Admin Bot
curl -X POST "https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/setWebhook" \
  -d "url=https://yourdomain.com/webhook/admin" \
  -d "secret_token=${WEBHOOK_SECRET}"
```

---

## 11. Порядок разработки (Milestones)

### Milestone 1 — Инфраструктура и БД (неделя 1)
- [ ] Настроить Supabase self-hosted на сервере
- [ ] Создать схему БД и миграции
- [ ] Инициализировать Bun monorepo с Hono
- [ ] Настроить TypeScript paths и shared types
- [ ] Настроить Nginx + TLS

### Milestone 2 — Боты и Auth (неделя 1-2)
- [ ] Создать Shop Bot: /start, кнопка WebApp
- [ ] Создать Admin Bot: главное меню
- [ ] Реализовать tmaAuth middleware
- [ ] Реализовать adminAuth middleware
- [ ] Настроить webhook для обоих ботов

### Milestone 3 — Poizon Integration (неделя 2)
- [ ] Исследовать и выбрать метод получения данных с Poizon
- [ ] Реализовать PoisonService
- [ ] Реализовать CurrencyService (ЦБ РФ + USDT)
- [ ] Реализовать PricingService
- [ ] Написать cron для синхронизации

### Milestone 4 — Shop API (неделя 2-3)
- [ ] GET /api/products (с пагинацией и фильтрами)
- [ ] GET /api/products/:id
- [ ] Cart CRUD
- [ ] Orders CRUD
- [ ] Уведомления пользователю от Shop Bot

### Milestone 5 — Admin API и Admin Bot (неделя 3)
- [ ] Полный Admin REST API
- [ ] Admin Bot: просмотр и управление заказами
- [ ] Admin Bot: настройка цен и наценки
- [ ] Admin Bot: запуск синхронизации

### Milestone 6 — Frontend Mini App (неделя 3-4)
- [ ] Главная страница (каталог)
- [ ] Страница товара
- [ ] Корзина
- [ ] Оформление заказа
- [ ] История заказов
- [ ] Тёмная тема (полная)

### Milestone 7 — QA и деплой (неделя 4)
- [ ] End-to-end тестирование пользовательских сценариев
- [ ] Нагрузочное тестирование API
- [ ] Настройка мониторинга (Uptime Kuma или аналог)
- [ ] Production деплой

---

## 12. Риски и ограничения

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Poizon заблокирует API-доступ | Высокая | Использовать сторонний проверенный провайдер данных; предусмотреть fallback на ручной импорт CSV |
| Изменение курса ЦБ РФ в нерабочее время | Средняя | Кэшировать курс с TTL 1ч; при ошибке использовать последний известный курс |
| Telegram отклонит Mini App | Низкая | Следовать Design Guidelines; не использовать запрещённые категории |
| Задержка уведомлений Telegram | Низкая | Retry-логика с exponential backoff |
| Легальный статус перепродажи с Poizon | Требует проверки | Консультация с юристом до запуска |

---

## 13. Что не входит в v1.0 (но предусмотрено архитектурой)

- Встроенная оплата (Telegram Stars, ЮKassa) — структура `orders` готова к добавлению payment_id
- Система промокодов — добавить таблицу `promo_codes`
- Мультиязычность — поле `name_ru` в products уже предусмотрено
- Реферальная программа — добавить `referrer_id` в таблицу `users`
- Витрина нескольких поставщиков — поле `source` в `products`
