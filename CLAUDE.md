# CLAUDE.md — Poizon Shop Telegram Mini App

## Контекст проекта

Telegram Mini App — магазин кроссовок/одежды/аксессуаров, работающий как посредник с платформы Poizon (DEWU, Китай). Два Telegram-бота: клиентский (Mini App) и административный. Монорепозиторий на Bun с Hono-сервером и Supabase self-hosted.

Полная спецификация: `docs/spec.md`

---

## Стек

| Слой | Технология |
|------|-----------|
| Runtime | Bun |
| API Framework | Hono v4 |
| Language | TypeScript (strict mode) |
| Database | Supabase self-hosted (PostgreSQL 15) |
| Frontend (Mini App) | Vanilla TypeScript + Vite |
| Package manager | Bun workspaces |
| Linter | Biome |
| Tests | Bun test |

---

## Структура монорепозитория

```
poizon-shop/
├── apps/
│   ├── api/          # Hono API + оба бота (Bun)
│   └── webapp/       # Telegram Mini App (Vite + TS)
├── packages/
│   └── shared/       # Общие TypeScript типы и утилиты
├── infra/            # docker-compose, nginx
├── docs/
│   └── spec.md       # Spec-First документация
├── CLAUDE.md         # Этот файл
└── package.json      # Workspaces root
```

---

## Команды разработки

> **Package manager:** репозиторий исторически использует Bun для локальной разработки,
> но Vercel-деплой и корневой `package.json` используют `npm` (workspaces). Команды ниже
> совместимы с обоими (`bun run X` ≡ `npm run X`).

```bash
# Установка зависимостей (из корня)
npm install   # или: bun install

# Запуск API сервера в dev режиме
npm run dev:api    # или: bun run dev:api

# Запуск Mini App (Vite dev server)
npm run dev:webapp

# Сборка (shared + webapp)
npm run build

# Тесты (Node test runner через tsx)
npm test
# или: bun test apps/api/src/

# Линтер (Biome)
npm run lint
npm run lint:fix

# Обновление курсов валют (CBR + Binance)
npm run rates:update

# Синхронизация товаров с Poizon (ручной запуск, блокируется на Vercel)
npm run sync:poizon

# Регистрация webhooks обоих ботов
npm run webhook:set
```

> Миграции Supabase применяются вручную через SQL Editor (см. `docs/deploy-vercel.md`); npm/bun-скрипта `db:migrate` нет.

---

## Архитектурные решения

### Два бота, один сервер

- `SHOP_BOT_TOKEN` — Shop Bot, к которому прикреплён Mini App WebApp
- `ADMIN_BOT_TOKEN` — Admin Bot только для владельца магазина
- Оба webhook обрабатываются одним Hono-сервером: `/webhook/shop` и `/webhook/admin`
- Webhook защищён заголовком `X-Telegram-Bot-Api-Secret-Token`

### Аутентификация

- **Mini App запросы**: заголовок `X-Telegram-Init-Data` с HMAC-валидацией по `SHOP_BOT_TOKEN`
- **Admin Bot запросы**: проверка `from.id` из telegram update против `admin_telegram_ids` в таблице `shop_config`
- Никогда не доверять данным без верификации подписи Telegram

### Ценообразование

```
price_rub  = price_cny * rate_cny_rub * (1 + markup/100) + delivery_fee
price_usdt = price_cny / rate_cny_usd * (1 + markup/100)
```

- Курс CNY→RUB: `https://www.cbr-xml-daily.ru/daily_json.js` (поле `CNY.Value`)
- USDT/RUB: Binance `GET /api/v3/ticker/price?symbol=USDTRUB`
- `rate_cny_usd` = `usdt_rub / cny_rub` (для формулы USDT без изменения семантики)
- Обновление: Vercel Cron `/cron/rates` каждый час + `bun run rates:update`
- При недоступности API — кэш в `pricing_config` / `shop_config`, затем env fallback

### Poizon API

**Важно:** официального публичного API у Poizon нет. Используется сторонний провайдер или reverse-engineered эндпоинты. Логика изолирована в `PoisonService` — если провайдер меняется, правится только один файл.

### Синхронизация товаров

- Полная синхронизация: **только ручной запуск** (`npm run sync:poizon`). Vercel-функция имеет 30s лимит — `runFullSync` явно отказывается работать на Vercel.
- Инкрементальная по категориям: не реализована.
- Все результаты логируются в таблицу `sync_logs`.

---

## Соглашения по коду

### Именование файлов

```
apps/api/src/
├── routes/          # *.route.ts
├── services/        # *.service.ts
├── middleware/      # *.middleware.ts
├── bots/            # *.bot.ts
├── db/              # *.repository.ts  (доступ к БД)
└── types/           # *.types.ts
```

### TypeScript

- `strict: true` везде — никаких `any`
- Все публичные функции имеют явные типы возвращаемого значения
- Zod для валидации входящих данных в routes
- `Result<T, E>` паттерн для ошибок в сервисах (не throw в business logic)

```typescript
// Хорошо
type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E }

// Плохо — не бросать из сервисов
throw new Error('Product not found')
```

### Hono routes

```typescript
// apps/api/src/routes/shop.route.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { tmaAuth } from '../middleware/auth.middleware'

const shop = new Hono()
shop.use('*', tmaAuth)

shop.get('/products', zValidator('query', ProductsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const user = c.get('telegramUser')
  // ...
})

export { shop }
```

### Supabase клиент

- Для серверных операций всегда использовать `serviceRoleKey` (полный доступ)
- Анонимный ключ (`anonKey`) — только для генерации публичных URL изображений
- Не использовать Supabase Auth — аутентификация через Telegram initData

---

## Переменные окружения

Все переменные описаны в `.env.example`. Обязательные:

```
SHOP_BOT_TOKEN        # от @BotFather
ADMIN_BOT_TOKEN       # от @BotFather
WEBHOOK_SECRET        # случайная строка ≥32 символов
SUPABASE_URL          # http://localhost:8000 (self-hosted)
SUPABASE_SERVICE_ROLE_KEY
POSTGRES_PASSWORD
CRON_SECRET           # ≥32 символов, для Vercel Cron /cron/rates
POIZON_PROVIDER       # mock | poparce | official
POIZON_API_KEY        # Poparce
POIZON_OFFICIAL_API_URL / POIZON_OFFICIAL_API_KEY  # Poizon-API/public-api
WEBAPP_URL            # https://yourdomain.com/webapp (HTTPS обязателен для TMA)
```

---

## Работа с базой данных

- Все миграции — в `infra/supabase/migrations/` в формате `001_init.sql`, `002_add_index.sql`
- Применяются вручную в Supabase SQL Editor в порядке номеров (см. `docs/deploy-vercel.md` раздел 1)
- Не редактировать уже применённые миграции — только новые файлы
- Row Level Security (RLS) в Supabase **отключён** — доступ через `serviceRoleKey` с проверкой прав на уровне приложения

---

## Тестирование

```bash
# Все тесты (apps/api)
npm test

# Тест конкретного файла
node --import tsx --test apps/api/src/services/pricing.service.test.ts

# Тест валидации initData (без реального токена)
node --import tsx --test apps/api/src/middleware/auth.middleware.test.ts
```

Покрытие тестами — обязательно для:
- `PricingService.calculatePrices()` — критическая бизнес-логика
- `validateInitData()` — безопасность
- `PoisonService` — моки внешнего API

---

## Деплой

См. [docs/deploy-vercel.md](docs/deploy-vercel.md) — это единственный актуальный сценарий (Vercel + Supabase Cloud).

---

## Часто задаваемые вопросы при разработке

**Q: Как протестировать Mini App локально?**
A: Использовать [ngrok](https://ngrok.com) или [cloudflared tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) для HTTPS-туннеля. Telegram требует HTTPS для WebApp URL. Обновить `WEBAPP_URL` и перерегистрировать webhook.

**Q: Где хранить состояние корзины?**
A: В таблице `cart_items` в Supabase. Не в localStorage — Mini App работает в sandboxed iframe где localStorage может быть недоступен.

**Q: Как добавить нового администратора?**
A: Обновить запись в `shop_config` таблице: `UPDATE shop_config SET value = '[id1, id2, id3]' WHERE key = 'admin_telegram_ids'`. Или через команду Admin Bot `/addadmin {telegram_id}`.

**Q: Что делать если Poizon API недоступен?**
A: `PoisonService` логирует ошибку в `sync_logs` и продолжает отображать последние синхронизированные данные. Цены и наличие могут быть устаревшими — в UI показывается дата последней синхронизации.
