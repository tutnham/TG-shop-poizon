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
- [Frontend (webapp)](#frontend-webapp)
- [Безопасность](#безопасность)
- [Оптимизация и backlog](#оптимизация-и-backlog)
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
    │               │  /api/admin/*   │
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
TG-shop/   (npm workspaces, root для Vercel)
├── api/                        # Vercel serverless entry (rewrites → Hono app)
│   └── index.ts
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
| `VITE_API_URL` | — | Базовый URL API для webapp; пусто = same-origin `/api` (Vercel rewrites) |

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
| `001_init.sql` | Таблицы, индексы, базовая схема (без RLS) |
| `002_demo_seed.sql` | Демо-данные для разработки |
| `003_exchange_rates.sql` | Расширение `pricing_config` (курсы CNY/RUB, USDT/RUB) |
| `004_perf_indexes.sql` | Индексы для производительности |
| `005_constraints.sql` | CHECK-ограничения и дополнительные индексы |
| `006_size_prices.sql` | Колонка `size_prices` (JSONB) для цен по размерам |
| `007_shihuo_product_ids.sql` | Колонки `shihuo_goods_id`, `shihuo_style_id` для Shihuo backfill |
| `008_rls.sql` | Row Level Security для таблиц |
| `009_create_order_atomic.sql` | RPC `create_shop_order` — атомарное создание заказа + оплата + очистка корзины |
| `010_product_filters.sql` | Фильтры каталога: `gender`, GIN-индекс по `stock` для размеров |
| `011_security_hardening.sql` | REVOKE EXECUTE на `create_shop_order`; ужесточение public RLS для `products` |

> **Важно:** миграции `001`–`010` обязательны до production. `011` — рекомендуется сразу после `010`.

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
| `npm run cron:webhooks` | Ручной вызов `GET /cron/webhooks` (нужны `API_URL`, `CRON_SECRET`) |
| `npm run sync:poizon` | Синхронизация товаров с Poizon |
| `npm run purge:stale:dry` | Dry-run очистки товаров, которых нет в `Export3.json` |
| `npm run import:export3` | Импорт товаров из `Export3.json` в корне проекта |
| `npm run purge:stale` | Очистка stale-товаров после проверки dry-run |

### Скрипты API (`apps/api`)

| Скрипт | Описание |
|--------|----------|
| `npm run db:migrate` | Печатает список миграций для ручного применения в Supabase SQL Editor (stub) |
| `npm run webhook:set` | Установка webhook |
| `npm run rates:update` | Обновление курсов |
| `npm run sync:poizon` | Синхронизация с Poizon |
| `npm run import:pop2` | Импорт из pop2.json |
| `npm run import:export3` | Импорт из `Export3.json` (`../../Export3.json` относительно `apps/api`) |
| `npm run import:clock` | Импорт из `clock.json` в корне проекта |
| `npm run patch:clock` | Патч каталога часов из `clock.json` |
| `npm run purge:stale:dry` | Предпросмотр replace-очистки каталога по `Export3.json` |
| `npm run purge:stale` | Удаление товаров, отсутствующих в переданной выгрузке |
| `npm run delete:demo` | Удаление демо-данных |
| `npm run fetch:prices` | Получение недостающих цен |

### Replace-импорт каталога из Export3.json

`Export3.json` должен лежать в корне проекта. Процесс replace-каталога удаляет из `products` товары, которых нет в новой выгрузке, включая ранее импортированные вручную `source=user_import`. Товары, которые остались в выгрузке, обновляются через upsert по `poizon_id`, поэтому их UUID сохраняются.

Рекомендуемый порядок:

```bash
# 1. Проверить, что будет удалено
npm run purge:stale:dry

# 2. Импортировать / обновить товары из Export3.json
npm run import:export3

# 3. Удалить stale-товары после проверки dry-run
npm run purge:stale
```

Если нужно сохранить старое поведение и чистить только `source=poizon`, используйте API-скрипт с флагом `--poizon-only`:

```bash
npm run purge:stale -w @poizon-shop/api -- ../../Export3.json --poizon-only
```

---

## API

### Shop API (Mini App)

**Публичный каталог (без initData):** `GET /api/products`, `/categories`, `/brands`, `/product-filters`, `/rates`, `/config`, `/products/:id`, `/ping`.

**Требуют `X-Telegram-Init-Data`:** корзина, заказы, `/user/language`, `/api/image-proxy`, `POST /api/products/import`.

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/api/ping` | optional | Health + статус Supabase |
| GET | `/api/config` | — | Публичный конфиг магазина |
| GET | `/api/rates` | — | Курсы CNY/RUB, USDT/RUB |
| GET | `/api/products` | — | Каталог товаров (с фильтрами) |
| POST | `/api/products/import` | initData | Импорт товара по артикулу/spuId (см. [Безопасность](#безопасность)) |
| GET | `/api/products/:id` | — | Карточка товара |
| GET | `/api/categories` | — | Список категорий |
| GET | `/api/brands` | — | Список брендов (опционально `?category=`) |
| GET | `/api/product-filters` | — | Размеры и полы для фильтров каталога |
| GET | `/api/cart` | initData | Корзина пользователя |
| POST | `/api/cart` | initData | Добавить в корзину |
| PATCH | `/api/cart/:itemId` | initData | Обновить количество/размер |
| DELETE | `/api/cart/:itemId` | initData | Удалить из корзины |
| POST | `/api/orders` | initData | Создать заказ |
| GET | `/api/orders` | initData | История заказов |
| GET | `/api/orders/:id` | initData | Детали заказа |
| PATCH | `/api/user/language` | initData | Обновить язык пользователя |

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
| `size` | string | — | Фильтр по доступному размеру из JSONB `stock` |
| `gender` | string | — | `male`, `female` (только мужское/женское в каталоге) |

#### Параметры GET /api/product-filters

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `category` | string | — | Slug категории; если передан, размеры и полы возвращаются только для этой категории |

### Admin API

Защищён `adminAuth`: initData подписывается **ADMIN_BOT_TOKEN** (в production fallback на `SHOP_BOT_TOKEN` отключён) + Telegram ID из белого списка.

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

По умолчанию: `mock`, если `POIZON_PROVIDER` не задан и нет `POIZON_API_KEY`. Если задан `POIZON_API_KEY` без явного провайдера — используется `poparce`.

**Ценообразование:**
- Цены с Poizon приходят в **фенях** (1 CNY = 100 фень)
- Пересчет: `price_rub = (price_cny * rate_cny_rub) * (1 + markup/100) + delivery_fee`
- Курсы обновляются из ЦБ РФ + Binance через Vercel Cron

### Проблемные вопросы Export3 и решения

| Вопрос | Решение |
|--------|---------|
| Где лежит новая выгрузка? | Используется `Export3.json` в корне проекта. Скрипты `import:export3` и `purge:stale:dry` ожидают именно этот путь. |
| Что делать со старыми товарами? | Replace-очистка удаляет все товары, чей `poizon_id` отсутствует в новой выгрузке, включая `source=user_import`. Перед реальным удалением запускать `npm run purge:stale:dry`. |
| Как не показывать старые категории? | `/api/categories` возвращает только категории, у которых есть доступные товары. Пустые старые категории исчезают из меню. |
| Что с вкладкой “Часы”? | В текущем Export3 категория часов может отсутствовать, поэтому UI показывает пустую вкладку `watches`. Когда в выгрузке появятся часы, импорт должен связать их с тем же slug. |
| Что будет с корзинами при удалении товара? | `cart_items.product_id` настроен с `ON DELETE CASCADE`, поэтому позиции удалённых товаров исчезнут из корзин. История заказов хранит JSONB snapshot и не ломается. |
| Как работает фильтр пола? | `gender` нормализуется при bulk-импорте через `normalizeProductGender()` и отдаётся в `/api/product-filters`; каталог фильтруется через `GET /api/products?gender=...`. |
| Как работает фильтр размера не только для обуви? | UI использует нейтральную подпись “Размер”. Backend фильтрует по ключам JSONB `stock`; товары без размеров показываются как “Без размера” в карточке. |

### Нерешённые проблемы

| Проблема | Статус | Что нужно сделать |
|----------|--------|-------------------|
| В `Export3.json` нет категории/товаров «Часы» | Открыто | Вкладка `watches` в UI показывается пустой. После появления часов в выгрузке — повторить `import:export3`; slug `watches` уже нормализуется в mapper. |
| Пустые строки категорий в БД | Открыто | `/api/categories` скрывает категории без доступных товаров, но физически orphan-строки в `categories` не удаляются (риск FK). Нужен отдельный cleanup-скрипт или RPC. |
| Replace-импорт — два шага, не один | Открыто | Рекомендуемый порядок: `purge:stale:dry` → `import:export3` → `purge:stale`. Единый orchestrator не реализован. |
| Неизвестные значения `gender` в выгрузке | Закрыто | В каталог попадают только `male`/`female`. Детское, унисекс и прочие значения (в т.ч. `"Малыши"`) пропускаются при импорте и удаляются replace-purge. |
| Товары без цены или без картинок | Открыто | Такие позиции пропускаются при импорте и не попадают в keep-set purge. Список пропусков виден только в stdout CLI — нет отдельного отчёта/файла. |
| Миграция `010_product_filters.sql` | Требует проверки | GIN-индекс и колонка `gender` должны быть применены в Supabase до production replace. Если миграция не накатывалась — фильтры size/gender будут медленными или сломаны. |
| `Export3.json` не в git | Осознанно | Файл выгрузки лежит локально в корне проекта и не коммитится (объём + операционные данные). Для CI/CD импорт нужно запускать вручную или через отдельный pipeline с артефактом. |
| Линт legacy CLI-скриптов | Закрыто | Операционные backfill/probe-скрипты исключены из Biome (`biome.json`); core API/webapp проходят `npm run lint`. |
| UI-фильтры без автотестов | Открыто | Webapp не имеет DOM/e2e тестов для chips категорий, size и gender; регрессии проверяются только `build` и ручным просмотром. |
| Производительность фильтра по `stock` JSONB | Наблюдение | При росте каталога фильтр `size` через `@>` по JSONB может тормозить без GIN. После replace стоит проверить explain на production-объёме. |

---

## Деплой на Vercel

### 1. Подготовка Supabase

- Создайте проект на [Supabase](https://supabase.com)
- Выполните миграции из `infra/supabase/migrations/` **по порядку** (001 → 011)
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

В `vercel.json` настроены cron-задачи (Vercel передаёт `Authorization: Bearer <CRON_SECRET>`):

| Путь | Расписание | Назначение |
|------|----------|------------|
| `GET /cron/rates` | `0 0 * * *` (ежедневно) | Обновление курсов CNY/RUB и USDT/RUB |
| `GET /cron/webhooks` | `0 1 * * *` (ежедневно) | Перерегистрация Telegram webhooks после redeploy |

Ручной вызов (локально с `.env`):

```bash
npm run cron:webhooks
```

### 8. Проверка

- `GET https://your-app.vercel.app/health` — health check
- Откройте Mini App из Telegram
- Оформите тестовый заказ → Admin Bot → подтвердите

---

## Frontend (webapp)

| Параметр | Значение |
|----------|----------|
| Стек | Vanilla TypeScript, Vite, hash-router, imperative DOM |
| Маршруты | `/`, `/menu`, `/product/:id`, `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/profile` |
| Auth | Заголовок `X-Telegram-Init-Data` на write-запросах; каталог читается без аккаунта |
| `VITE_API_URL` | Пусто = same-origin `/api`; в dev proxy на `localhost:3000` через `vite.config.ts` |
| i18n | Только `ru.json`; язык из Telegram initData пока не переключает UI |
| Checkout | Упрощённый flow: `payment_method: "none"` — менеджер подтверждает заказ в Admin Bot |
| Без Telegram | `DEMO_MODE=true` на API не создаёт сессию; корзина/заказы вернут `401` без initData |
| Тесты | Webapp без unit/e2e; регрессии — `npm run build` + ручной просмотр в Telegram |

---

## Безопасность

- **Каталог (read-only):** `GET /api/products`, `/categories`, `/brands`, `/product-filters`, `/rates`, `/config`, `/products/:id` — без initData; guest-пользователь в БД не создаётся
- **Личные действия (write):** корзина, заказы, `/user/language` — только с валидным `X-Telegram-Init-Data` (HMAC Telegram Mini App, TTL 24ч); без initData → `401`
- **Image proxy:** `/api/image-proxy` — только для клиентов Mini App с initData; allowlist хостов
- **Import по артикулу:** `POST /api/products/import` доступен любому авторизованному пользователю Mini App (10 req/min на userId). Рекомендуется ограничить admin-only в будущем
- **Admin API:** initData подписывается `ADMIN_BOT_TOKEN` + whitelist Telegram ID
- **Rate limits:** webhook/mutation/import лимиты in-process (`Map`) — на Vercel serverless не глобальны между инстансами; см. [Оптимизация](#оптимизация-и-backlog)
- **RPC `create_shop_order`:** атомарное создание заказа; миграция `011` ограничивает `EXECUTE` только для `service_role`
- **RLS:** backend использует `service_role` и обходит RLS; миграция `011` синхронизирует anon policy для `products` с app-фильтрами
- `WEBHOOK_SECRET` и `CRON_SECRET` ≥32 символов в production; constant-time сравнение
- `service_role` key никогда не передаётся на клиент
- Bot tokens только в переменных окружения
- Cron endpoint: `Authorization: Bearer $CRON_SECRET`
- Статические ассеты (`/assets/*`) — `Cache-Control: public, max-age=31536000, immutable`

---

## Оптимизация и backlog

Приоритетные улучшения (подробнее — [docs/optimization-backlog.md](docs/optimization-backlog.md)):

| Приоритет | Область | Действие |
|-----------|---------|----------|
| Высокий | Rate limits | Upstash Redis / Vercel KV вместо in-memory `Map` |
| Высокий | Каталог | Cursor/keyset pagination вместо offset `.range()` |
| Средний | Фильтры | SQL/RPC aggregates для `listAvailableSizes` / brands |
| Средний | Image proxy | Streaming response вместо `arrayBuffer()` до 5 MB |
| Средний | Webapp bundle | Subset иконок/шрифтов, lazy CSS per-route |
| Низкий | Import orchestrator | Единый скрипт replace-каталога с отчётом |

---

## Тестирование

```bash
# Запуск всех тестов (API + webapp)
npm test

# Только API
npm run test -w @poizon-shop/api

# Только webapp (escapeHtml и др.)
npm run test -w @poizon-shop/webapp
```

---

## Лицензия

Private — для внутреннего использования.