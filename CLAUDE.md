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

```bash
# Установка зависимостей (из корня)
bun install

# Запуск API сервера в dev режиме
bun run --cwd apps/api dev

# Запуск Mini App (Vite dev server)
bun run --cwd apps/webapp dev

# Запуск обоих одновременно
bun run dev

# Сборка
bun run build

# Тесты
bun run --cwd apps/api test

# Линтер (Biome)
bun run lint
bun run lint:fix

# Миграции БД
bun run --cwd apps/api db:migrate
bun run --cwd apps/api db:migrate:rollback

# Синхронизация товаров с Poizon (ручной запуск)
bun run --cwd apps/api sync:poizon

# Регистрация webhooks обоих ботов
bun run --cwd apps/api webhook:set
```

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

- Курс CNY→RUB: API ЦБ РФ, обновление каждый час
- Курс CNY→USD: CoinGecko или Binance P2P
- При недоступности внешнего API — использовать последний кэшированный курс

### Poizon API

**Важно:** официального публичного API у Poizon нет. Используется сторонний провайдер или reverse-engineered эндпоинты. Логика изолирована в `PoisonService` — если провайдер меняется, правится только один файл.

### Синхронизация товаров

- Полная синхронизация: cron каждые 6 часов (`0 */6 * * *`)
- Инкрементальная по категориям: каждый час
- Ручной запуск: команда `/sync` в Admin Bot
- Все результаты логируются в таблицу `sync_logs`

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
POIZON_API_URL        # URL провайдера данных
POIZON_API_KEY
WEBAPP_URL            # https://yourdomain.com/webapp (HTTPS обязателен для TMA)
```

---

## Работа с базой данных

- Все миграции — в `apps/api/src/db/migrations/` в формате `001_init.sql`, `002_add_index.sql`
- Применять через `bun run db:migrate`, откатывать через `bun run db:migrate:rollback`
- Не редактировать уже применённые миграции — только новые файлы
- Row Level Security (RLS) в Supabase **отключён** — доступ через `serviceRoleKey` с проверкой прав на уровне приложения

---

## Тестирование

```bash
# Unit тесты сервисов
bun test apps/api/src/services/

# Тест конкретного файла
bun test apps/api/src/services/pricing.service.test.ts

# Integration тесты (требуют запущенный Supabase)
bun test --env-file .env.test apps/api/src/

# Тест валидации initData (без реального токена)
bun test apps/api/src/middleware/auth.middleware.test.ts
```

Покрытие тестами — обязательно для:
- `PricingService.calculatePrices()` — критическая бизнес-логика
- `validateInitData()` — безопасность
- `PoisonService` — моки внешнего API

---

## Деплой

1. Убедиться что Supabase self-hosted запущен: `docker-compose up -d`
2. Применить миграции: `bun run db:migrate`
3. Собрать: `bun run build`
4. Запустить API: `bun run start` (или через pm2: `pm2 start ecosystem.config.js`)
5. Зарегистрировать webhooks: `bun run webhook:set`
6. Собрать и задеплоить Mini App: `bun run --cwd apps/webapp build` → скопировать `dist/` в `/var/www/poizon-shop/webapp`

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
