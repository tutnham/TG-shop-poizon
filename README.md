# Poizon Shop — Telegram Mini App

Магазин кроссовок и одежды с Poizon: Mini App + Admin Bot + оплата RUB / USDT.

## Содержание

- [Обзор](#обзор)
- [Архитектура](#архитектура)
- [Технологический стек](#технологический-стек)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Работа с проектом](#работа-с-проектом)
- [API](#api)
- [Telegram боты](#telegram-боты)
- [Poizen-провайдеры](#poizen-провайдеры)
- [Деплой на Vercel](#деплой-на-vercel)
- [Безопасность](#безопасность)
- [Тестирование](#тестирование)
- [Документация](#документация)

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
| Backend API | [Hono](https://hono.dev) (Node.js/TS) |
| Frontend | Vanilla TypeScript + [Vite](https://vitejs.dev) |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| Bots | [Grammy](https://grammy.dev) |
| Validation | [Zod](https://zod.dev) |
| Lint/Format | [Biome](https://biomejs.dev) |
| Deployment | [Vercel](https://vercel.com) |

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
│   │   │   ├── migrate.ts
│   │   │   ├── webhook-set.ts
│   │   │   ├── rates-update.ts
│   │   │   ├── poizon-sync.ts
│   │   │   ├── import-pop2.ts
│   │   │   └── delete-demo.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── webapp/                 # Telegram Mini App
│       ├── src/
│       │   ├── api/            # API клиент
│       │   ├── components/     # UI компоненты
│       │   ├── data/           # Данные/конфигурация
│       │   ├── i18n/           # Локализация
│       │   ├── lib/            # Утилиты
│       │   ├── pages/          # Страницы приложения
│       │   ├── styles/         # CSS
│       │   ├── main.ts         # Точка входа
│       │   ├── router.ts       # SPA роутер
│       │   ├── shell.ts        # Шелл-приложения
│       │   └── telegram.ts     # Telegram WebApp SDK
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   └── shared/                 # Общие типы и Zod-схемы
│       ├── src/
│       │   ├── schemas/
│       │   ├── types/
│       │   │   ├── api.ts
│       │   │   ├── order.ts
│       │   │   └── product.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── infra/
│   └── supabase/migrations/    # SQL-миграции
│       ├── 001_init.sql
│       ├── 002_demo_seed.sql
│       ├── 003_exchange_rates.sql
│       └── 004_perf_indexes.sql
├── docs/
│   ├── deploy-vercel.md
│   ├── poizon-providers.md
│   └── security-scan-notes.md
├── vercel.json                 # Конфигурация Vercel
├── biome.json                  # Конфигурация Biome
├── design.md                   # Визуальная спецификация
├── poizon_shop_spec.md         # Полная спецификация проекта
└── package.json                # Root workspaces
```

---

## Быстрый старт

### Требования

- Node.js 18+ (или Bun)
- npm 9+ (с поддержкой workspaces)

### Установка

```bash
# Клонирование репозитория
git clone <repo-url>
cd poizon-shop

# Установка зависимостей
npm install

# Копирование шаблона переменных окружения
cp .env.example .env
```

### Настройка окружения

Заполните `.env` файл (см. [Переменные окружения](#переменные-окружения)).

### База данных

1. Создайте проект на [Supabase](https://supabase.com)
2. В SQL Editor выполните миграции по порядку:
   - `infra/supabase/migrations/001_init.sql`
   - `infra/supabase/migrations/002_demo_seed.sql`
   - `infra/supabase/migrations/003_exchange_rates.sql`
   - `infra/supabase/migrations/004_perf_indexes.sql`
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

```env
# Telegram Bots (получить у @BotFather)
SHOP_BOT_TOKEN=               # Токен клиентского бота
ADMIN_BOT_TOKEN=              # Токен админ-бота
WEBHOOK_SECRET=               # Случайная строка ≥32 символов

# Server
PORT=3000                     # Порт API сервера
DEMO_MODE=false               # true — UI без Telegram (только для разработки)
NODE_ENV=development

# URLs (после деплоя)
WEBAPP_URL=https://your-project.vercel.app
API_URL=https://your-project.vercel.app

# Supabase Cloud
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # Service role key (не anon!)
SUPABASE_ANON_KEY=

# Vercel Cron
CRON_SECRET=                  # Случайная строка ≥32 символов

# Poizon провайдер: mock | poparce | official
POIZON_PROVIDER=mock
POIZON_API_KEY=               # Ключ Poparce (для poparce)
POIZON_API_BASE_URL=https://poparce.ru/api/dewu
POIZON_OFFICIAL_API_URL=https://poizon-api.com/api/dewu
POIZON_OFFICIAL_API_KEY=      # Ключ official API

# Курсы валют (fallback при недоступности CBR/Binance)
CNY_TO_RUB_RATE=13.5
CNY_TO_USD_RATE=7.25
MARKUP_PERCENT=25             # Наценка в процентах
DELIVERY_RUB=0                # Фикс. доставка в рублях

# TON платежи (опционально)
TON_WALLET_ADDRESS=
TON_RATE_USD=2.5

# Vercel Deployment Protection (опционально)
VERCEL_AUTOMATION_BYPASS_SECRET=

# CORS (опционально, через запятую)
CORS_ORIGINS=

# Image proxy (опционально)
IMAGE_PROXY_ALLOWED_HOSTS=
```

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

Защищен проверкой Telegram ID администратора.

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
- 📦 Новые заказы
- 📋 Все заказы
- 💰 Настройки цен
- 🔄 Синхронизация
- ⚙️ Настройки
- 📊 Статистика

---

## Poizen-провайдеры

Переключение провайдеров через переменную `POIZON_PROVIDER`:

| Провайдер | Значение | Описание |
|-----------|----------|----------|
| Mock | `mock` | Локальная разработка без ключей |
| Poparce | `poparce` | Сторонний DEWU API (`POIZON_API_KEY`) |
| Official | `official` | [Poizon-API/public-api](https://github.com/Poizon-API/public-api) |

По умолчанию: `poparce` если задан `POIZON_API_KEY`, иначе `mock`.

**Ценообразование:**
- Цены с Poizon приходят в **фенях** (1 CNY = 100 фень)
- Пересчет: `price_rub = (price_cny * rate_cny_rub) * (1 + markup/100) + delivery_fee`
- Курсы обновляются из ЦБ РФ + Binance каждый час

---

## Деплой на Vercel

### 1. Подготовка Supabase

- Создайте проект на [Supabase](https://supabase.com)
- Выполните миграции из `infra/supabase/migrations/`
- Скопируйте URL и `service_role` key

### 2. Telegram боты

- @BotFather → `/newbot` — создайте Shop Bot и Admin Bot
- Shop Bot → `/newapp` — создайте Mini App
- Укажите URL после деплоя

### 3. Настройка Vercel

**Важно — Root Directory:**
- **Settings → General → Root Directory** = пусто (корень репозитория)
- Build Command и Install Command — Override **выключен**
- Output Directory — Override **выключен**

### 4. Переменные окружения Vercel

Добавьте все переменные из `.env.example` в Vercel → Settings → Environment Variables.

### 5. Деплой

Подключите репозиторий к Vercel. Деплой запустится автоматически.

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
- `GET https://your-app.vercel.app/cron/rates` (с Bearer CRON_SECRET) — ручное обновление курсов
- Откройте Mini App из Telegram
- Оформите тестовый заказ → Admin Bot → подтвердите

---

## Безопасность

- Все API-запросы от Mini App валидируют `X-Telegram-Init-Data` через HMAC-подпись
- Admin API защищен проверкой Telegram ID из белого списка
- Webhook секреты должны быть ≥32 символов в production
- `service_role` key никогда не передается на клиент
- Bot tokens только в переменных окружения
- Cron endpoint требует `Authorization: Bearer $CRON_SECRET`

---

## Тестирование

```bash
# Запуск всех тестов
npm test

# Тесты API
npm run test -w @poizon-shop/api
```

---

## Документация

- [Деплой Vercel](docs/deploy-vercel.md) — Подробная инструкция по деплою
- [Poizon провайдеры](docs/poizon-providers.md) — Интеграция с Poizon API
- [Security notes](docs/security-scan-notes.md) — Заметки по безопасности
- [design.md](design.md) — Визуальная и UX-спецификация
- [poizon_shop_spec.md](poizon_shop_spec.md) — Полная спецификация проекта

---

## Лицензия

Private — для внутреннего использования.
