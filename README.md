# Poizon Shop — Telegram Mini App

Магазин кроссовок и одежды с Poizon: Mini App + Admin Bot + оплата TON / RUB / USDT.

## Быстрый старт

```bash
bun install
cp .env.example .env
# Заполните Supabase и bot tokens

bun run --cwd packages/shared build
bun run dev:api    # http://localhost:3000
bun run dev:webapp # http://localhost:5173
```

## Документация

- [Деплой Vercel](docs/deploy-vercel.md)
- [CLAUDE.md](CLAUDE.md)
- [design.md](design.md)

## Структура

- `apps/api` — Hono API, webhooks, боты
- `apps/webapp` — Telegram Mini App (Vite)
- `packages/shared` — типы и Zod-схемы
- `infra/supabase/migrations` — SQL

## Тесты

```bash
bun run test
```
