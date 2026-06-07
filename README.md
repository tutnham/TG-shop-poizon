# Poizon Shop — Telegram Mini App

Магазин кроссовок и одежды с Poizon: Mini App + Admin Bot + оплата TON / RUB / USDT.

## Быстрый старт

> Репозиторий — npm workspaces (Vercel-деплой совместим). Локально также работает Bun.

```bash
npm install
cp .env.example .env
# Заполните Supabase, bot tokens, CRON_SECRET (prod), POIZON_*

# Миграции в Supabase SQL Editor (см. apps/api/scripts/migrate.ts):
# 001_init.sql → 002_demo_seed.sql → 003_exchange_rates.sql

npm run dev:api    # http://localhost:3000
npm run dev:webapp # http://localhost:5173

# Курсы CBR + Binance + webhook (из корня репозитория)
npm run rates:update
npm run webhook:set
```

## Документация

- [Деплой Vercel](docs/deploy-vercel.md)
- [Poizon providers](docs/poizon-providers.md)
- [Security notes](docs/security-scan-notes.md)
- [CLAUDE.md](CLAUDE.md)
- [design.md](design.md)

## Структура

- `apps/api` — Hono API, webhooks, боты
- `apps/webapp` — Telegram Mini App (Vite)
- `packages/shared` — типы и Zod-схемы
- `infra/supabase/migrations` — SQL

## Тесты

```bash
npm test
```
