# Poizon Shop — Telegram Mini App

Магазин кроссовок и одежды с Poizon: Mini App + Admin Bot + оплата RUB / USDT.

## Содержание

- [Обзор](#обзор)
- [Архитектура](#архитектура)
- [Технологический стек](#технологический-стек)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [База данных](#база-данных)
- [Работа с проектом](#работа-с-проектом)
- [API](#api)
- [Telegram боты](#telegram-боты)
- [Poizon-провайдеры](#poizon-провайдеры)
- [Деплой на Vercel](#деплой-на-vercel)
- [Безопасность](#безопасность)
- [Тестирование](#тестирование)

---

## Обзор

Telegram Mini App — интернет-магазин кроссовок, одежды и аксессуаров, работающий как посредник на базе китайской платформы Poizon (DEWU). Товары синхронизируются через Poizon API. Цены отображаются в рублях (с настраиваемой наценкой) и USDT. Управление магазином осуществляется через отдельный Telegram-бот для администратора.

### Ключевые возможности

- **Каталог товаров** с фильтрами, поиском и бесконечным скроллом
- **Карточка товара** с галереей, выбором размера и ценами в RUB/USDT
- **Корзина** с управлением позициями
- **Оформление заказа** с выбором способа оплаты
- **История заказов** с отслеживанием статуса
- **Admin Bot** для управления заказами и настройками
- **Автоматическая синхронизация** цен и курсов валют
- **Темная тема**, оптимизированная для Telegram Mini Apps

---

## Архитектура

```
Telegram Servers
    │
    ├── Shop Bot webhook  →  /webhook/shop
    └── Admin Bot webhook →  /webhook/admin
                              │
                              ▼
                    ┌─────────────────┐
                    │  Hono API       │
                    │  (Vercel/Node)  │
                    │                 │
    ┌───────────────┤  /api/*         │
    │               │  /admin/*       │
    │               │  /cron/*        │
    │               └───────┬─────────┘
    │                       │
    ▼                       ▼
WebApp (Vite)         Supabase Cloud
(telegram-web-app)    (PostgreSQL)
```

### Два Telegram-бота

| Бот | Назначение | Интерфейс |
|-----|------------|-----------|
| **Shop Bot** | Клиентский магазин | Telegram Mini App (WebApp) |
| **Admin Bot** | Управление магазином | Telegram Bot с inline-клавиатурой |

---

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Backend API | [Hono](https://hono.dev) (Node.js/TypeScript) |
| Frontend | Vanilla TypeScript + [Vite](https://vitejs.dev) |
| Database | [Supabase](https://supabase.com) Cloud (PostgreSQL) |
| Bots | [Grammy](https://grammy.dev) |
| Validation | [Zod](https://zod.dev) |
| Lint/Format | [Biome](https://biomejs.dev) |
| Deployment | [Vercel](https://vercel.com) |
| Runtime | Node.js 18+ (не Bun) |

---

## Структура проекта

```
poizon-shop/
├── apps/
│   ├── api/                    # Hono API сервер
│   │   ├── src/
│   │   │   ├── bots/           # Shop Bot, Admin Bot
│   │   │   ├── db/             # Supabase клиент, репозитории
│   │   │   ├── lib/            # Утилиты, middleware
│   │   │   ├── middleware/     # CORS, auth, валидация
│   │   │   ├── routes/         # API маршруты
│   │   │   ├── services/       # Бизнес-логика
│   │   │   │   ├── exchange/   # Курсы валют
│   │   │   │   ├── cache.service.ts
│   │   │   │   ├── currency.service.ts
│   │   │   │   ├── order.service.ts
│   │   │   │   ├── poizon.service.ts
│   │   │   │   └── ...
│   │   │   ├── types/          # Типы приложения
│   │   │   ├── app.ts          # Конфигурация Hono
│   │   │   └── index.ts        # Точка входа
│   │   ├── scripts/            # CLI-скрипты
│   │   └── package.json
│   └── webapp/                 # Telegram Mini App
│       ├── src/
│       │   ├── api/            # API клиент
│       │   ├── components/     # UI компоненты
│       │   ├── i18n/           # Локализация
│       │   ├── lib/            # Утилиты
│       │   ├── pages/          # Страницы приложения
│       │   ├── styles/         # CSS
│       │   ├── main.ts         # Точка входа
│       │   ├── router.ts       # SPA роутер
│       │   └── telegram.ts     # Telegram WebApp SDK
│       ├── index.html
│       └── vite.config.ts
├── packages/
│   └── shared/                 # Общие типы и Zod-схемы
├── infra/
│   └── supabase/migrations/    # SQL-миграции (выполнять по порядку)
├── scripts/
│   └── build-vercel.js         # Сборка webapp → dist для Vercel
├── vercel.json                 # Конфигурация Vercel
├── biome.json                  # Конфигурация Biome
└── package.json                # Root workspaces
```

---

## Быстрый старт

### Требования

- **Node.js 18+** (Bun не поддерживается в Vercel-деплое)
- npm 9+ (с поддержкой workspaces)

### Установка

```bash
git clone <repo-url>
cd poizon-shop
npm install
cp .env.example .env
```

### Настройка окружения

Заполните `.env` файл (см. [Переменные окружения](#переменные-окружения)).

### База данных

1. Создайте проект на [Supabase](https://supabase.com)
2. В SQL Editor выполните миграции по порядку (см. [База данных](#база-данных))
3. Скопируйте URL и `service_role` key в `.env`

### Локальная разработка

```bash
# Запуск API сервера (http://localhost:3000)
npm run dev:api

# Запуск Mini App (http://localhost:5173)
npm run dev:webapp

# Обновление курсов валют
npm run rates:update

# Установка webhook для ботов
npm run webhook:set
```

---

## Переменные окружения

Полный шаблон — в `.env.example`.

### Обязательные (production)

| Переменная | Описание | Требование |
|-----------|----------|------------|
| `SHOP_BOT_TOKEN` | Токен клиентского бота (@BotFather) | Обязательно |
| `ADMIN_BOT_TOKEN` | Токен админ-бота (@BotFather) | Обязательно |
| `WEBHOOK_SECRET` | Секрет для webhook верификации | ≥32 символа в production |
| `SUPABASE_URL` | URL проекта Supabase | Без `/rest/v1/` суффикса |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Не anon key! |
| `WEBAPP_URL` | URL деплоя Mini App | После деплоя на Vercel |
| `API_URL` | URL API | После деплоя на Vercel |
| `CRON_SECRET` | Секрет для Vercel Cron | ≥32 символа в production |

### Poizon провайдер

| Переменная | Описание |
|-----------|----------|
| `POIZON_PROVIDER` | `mock` \| `poparce` \| `official` |
| `POIZON_API_KEY` | Ключ для poparce |
| `POIZON_API_BASE_URL` | URL poparce API |
| `POIZON_OFFICIAL_API_KEY` | Ключ для official (нужен `POIZON_PROVIDER=official`) |
| `POIZON_OFFICIAL_API_URL` | URL official API |

### Опциональные

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `PORT` | 3000 | Порт для локальной разработки |
| `DEMO_MODE` | false | UI без Telegram (только разработка) |
| `NODE_ENV` | development | — |
| `SUPABASE_ANON_KEY` | — | Не используется сервером |
| `CNY_TO_RUB_RATE` | 13.5 | Fallback курса CNY→RUB |
| `CNY_TO_USD_RATE` | 7.25 | Fallback курса CNY→USD |
| `MARKUP_PERCENT` | 25 | Наценка в % |
| `DELIVERY_RUB` | 0 | Фиксированная доставка (₽) |
| `TON_WALLET_ADDRESS` | — | TON кошелёк для оплат |
| `TON_RATE_USD` | 2.5 | Курс TON/USD |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | — | Bypass Deployment Protection |
| `CORS_ORIGINS` | — | Дополнительные CORS origins (через запятую) |
| `IMAGE_PROXY_ALLOWED_HOSTS` | — | Дополнительные хосты для image proxy |

### Pricing module (продвинутые)

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `PRICING_PUBLIC_RATE_POLICY` | ALLOW_FALLBACK | `STRICT` \| `ALLOW_FALLBACK` |
| `PRICING_INTERNAL_RATE_POLICY` | ALLOW_FALLBACK | `STRICT` \| `ALLOW_FALLBACK` |
| `PRICING_ROUNDING_MODE` | ROUND_CEIL | `ROUND_HALF_UP` \| `ROUND_CEIL` |
| `PRICING_ROUNDING_SCALE` | 0 | Знаки после запятой |
| `PRICING_CNY_RUB_TTL_MS` | 86400000 | TTL кеша CNY→RUB (24ч) |
| `PRICING_USDT_RUB_TTL_MS` | 300000 | TTL кеша USDT→RUB (5мин) |
| `PRICING_FX_BUFFER_PCT` | 0.03 | Буфер волатильности USDT (3%) |

---

## База данных

Миграции находятся в `infra/supabase/migrations/`. Выполнять **строго по порядку** в SQL Editor Supabase:

| Файл | Описание |
|------|----------|
| `001_init.sql` | Таблицы, RLS, базовая структура |
| `002_demo_seed.sql` | Демо-данные для разработки |
| `003_exchange_rates.sql` | Таблица курсов валют |
| `004_perf_indexes.sql` | Индексы для производительности |
| `005_constraints.sql` | CHECK-ограничения и дополнительные индексы |

---

## Работа с проектом

### Скрипты

| Скрипт | Описание |
|--------|----------|
| `npm run dev:api` | Запуск API сервера в режиме разработки |
| `npm run dev:webapp` | Запуск Mini App в режиме разработки |
| `npm run build` | Сборка shared + webapp |
| `npm run build:api` | Сборка shared + typecheck API |
| `npm run lint` | Проверка кода (Biome) |
| `npm run lint:fix` | Автоисправление кода |
| `npm test` | Запуск тестов |
| `npm run rates:update` | Обновление курсов валют |
| `npm run webhook:set` | Установка webhook для ботов |
| `npm run sync:poizon` | Синхронизация товаров с Poizon |

### Скрипты API (`apps/api`)

| Скрипт | Описание |
|--------|----------|
| `npm run db:migrate` | Выполнение миграций БД |
| `npm run webhook:set` | Установка webhook |
| `npm run rates:update` | Обновление курсов |
| `npm run sync:poizon` | Синхронизация с Poizon |
| `npm run import:pop2` | Импорт из pop2.json |
| `npm run delete:demo` | Удаление демо-данных |
| `npm run fetch:prices` | Получение недостающих цен |

---

## API

### Shop API (Mini App)

Все эндпоинты защищены middleware валидации Telegram initData (`X-Telegram-Init-Data`).

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/products` | Каталог товаров (с фильтрами) |
| GET | `/api/products/:id` | Карточка товара |
| GET | `/api/categories` | Список категорий |
| GET | `/api/cart` | Корзина пользователя |
| POST | `/api/cart` | Добавить в корзину |
| PATCH | `/api/cart/:itemId` | Обновить количество/размер |
| DELETE | `/api/cart/:itemId` | Удалить из корзины |
| POST | `/api/orders` | Создать заказ |
| GET | `/api/orders` | История заказов |
| GET | `/api/orders/:id` | Детали заказа |
| GET | `/api/config` | Публичный конфиг магазина |

#### Параметры GET /api/products

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

### Admin API

Защищен проверкой Telegram ID администратора из белого списка.

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/dashboard` | Статистика |
| GET | `/api/admin/orders` | Список заказов |
| GET | `/api/admin/orders/:id` | Детали заказа |
| PATCH | `/api/admin/orders/:id/status` | Обновить статус |
| PATCH | `/api/admin/orders/:id/tracking` | Добавить трек-номер |
| GET | `/api/admin/products` | Список товаров |
| PATCH | `/api/admin/products/:id/visibility` | Показать/скрыть товар |
| POST | `/api/admin/products/sync` | Запустить синхронизацию |
| GET | `/api/admin/pricing` | Настройки цен |
| PATCH | `/api/admin/pricing` | Обновить наценку/курс |
| GET | `/api/admin/sync-logs` | История синхронизаций |
| GET | `/api/admin/config` | Настройки магазина |
| PATCH | `/api/admin/config` | Обновить настройки |

### Webhooks

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/webhook/shop` | Shop Bot webhook |
| POST | `/webhook/admin` | Admin Bot webhook |

### Служебные

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Health check |
| GET | `/cron/rates` | Обновление курсов (Vercel Cron) |
| GET | `/api/image-proxy` | Проксирование изображений |

---

## Telegram боты

### Shop Bot

**Команды:**
- `/start` — приветственное сообщение + кнопка "Открыть магазин" (WebApp)
- `/shop` — кнопка открытия Mini App
- `/orders` — история заказов
- `/help` — FAQ

**Уведомления пользователю:**
- Заказ принят
- Заказ подтвержден / оплачен
- Заказ отправлен (с трек-номером)
- Заказ доставлен

### Admin Bot

**Команды:**
- `/start` — главное меню (inline-кнопки)
- `/orders` — список новых заказов
- `/stats` — статистика
- `/sync` — запустить синхронизацию
- `/pricing` — настройки цен
- `/config` — настройки магазина

**Inline-меню:**
- Новые заказы
- Все заказы
- Настройки цен
- Синхронизация
- Настройки
- Статистика

---

## Poizon-провайдеры

Переключение провайдеров через переменную `POIZON_PROVIDER`:

| Провайдер | Значение | Описание |
|-----------|----------|----------|
| Mock | `mock` | Локальная разработка без ключей |
| Poparce | `poparce` | Сторонний DEWU API (`POIZON_API_KEY`) |
| Official | `official` | Poizon-API/public-api (`POIZON_OFFICIAL_API_KEY`) |

По умолчанию: `mock`.

**Ценообразование:**
- Цены с Poizon приходят в **фенях** (1 CNY = 100 фень)
- Пересчет: `price_rub = (price_cny * rate_cny_rub) * (1 + markup/100) + delivery_fee`
- Курсы обновляются из ЦБ РФ + Binance через Vercel Cron

---

## Деплой на Vercel

### 1. Подготовка Supabase

- Создайте проект на [Supabase](https://supabase.com)
- Выполните миграции из `infra/supabase/migrations/` **по порядку** (001 → 005)
- Скопируйте URL и `service_role` key

### 2. Telegram боты

- @BotFather → `/newbot` — создайте Shop Bot и Admin Bot
- Shop Bot → `/newapp` — создайте Mini App
- Укажите URL после деплоя

### 3. Настройка Vercel

**Root Directory:** пусто (корень репозитория). Build Command и Output Directory — не переопределять (управляются `vercel.json`).

### 4. Переменные окружения Vercel

Добавьте все обязательные переменные из `.env.example` в Vercel → Settings → Environment Variables.

### 5. Деплой

Подключите репозиторий к Vercel. Деплой запустится автоматически. Сборка:
1. `npm ci --workspaces --include-workspace-root`
2. `npm run build -w @poizon-shop/shared && npm run build -w @poizon-shop/webapp && node scripts/build-vercel.js`

### 6. Webhooks

```bash
# После деплоя локально с .env:
npm run webhook:set
npm run rates:update
```

Или вручную:

```bash
curl -X POST "https://api.telegram.org/bot<SHOP_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_APP.vercel.app/webhook/shop","secret_token":"YOUR_SECRET"}'

curl -X POST "https://api.telegram.org/bot<ADMIN_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_APP.vercel.app/webhook/admin","secret_token":"YOUR_SECRET"}'
```

### 7. Vercel Cron

В `vercel.json` настроен cron `GET /cron/rates` каждый час. Vercel передает `Authorization: Bearer <CRON_SECRET>`.

### 8. Проверка

- `GET https://your-app.vercel.app/health` — health check
- Откройте Mini App из Telegram
- Оформите тестовый заказ → Admin Bot → подтвердите

---

## Безопасность

- **Каталог (read-only):** `GET /api/products`, `/categories`, `/rates`, `/config` — доступны без аккаунта; guest-пользователь в БД не создаётся
- **Личные действия (write):** корзина, заказы, профиль — только с валидным `X-Telegram-Init-Data` (HMAC-подпись Telegram Mini App); без initData → `401`
- **Image proxy:** `/api/image-proxy` — только для авторизованных клиентов Mini App (initData обязателен)
- Admin API защищён проверкой Telegram ID из белого списка
- `WEBHOOK_SECRET` и `CRON_SECRET` должны быть ≥32 символов в production; сравнение секретов — constant-time
- `service_role` key никогда не передаётся на клиент
- Bot tokens только в переменных окружения
- Cron endpoint требует `Authorization: Bearer $CRON_SECRET`
- Статические ассеты (/assets/*) кешируются на 1 год с immutable

---

## Тестирование

```bash
# Запуск всех тестов
npm test

# Тесты API
npm run test -w @poizon-shop/api
```

---

## Лицензия

Private — для внутреннего использования.