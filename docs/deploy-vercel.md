# Деплой Poizon Shop на Vercel

## 1. Supabase Cloud

1. Создайте проект на https://supabase.com
2. SQL Editor → выполните по порядку:
   - `infra/supabase/migrations/001_init.sql`
   - `infra/supabase/migrations/002_demo_seed.sql`
3. Settings → API: скопируйте `URL` и `service_role` key

## 2. Telegram боты

1. @BotFather → `/newbot` — Shop Bot и Admin Bot
2. Shop Bot → `/newapp` → укажите URL Vercel после деплоя
3. Shop Bot → Bot Settings → Menu Button → Web App URL

## 3. Переменные Vercel

| Variable | Описание |
|----------|----------|
| `SHOP_BOT_TOKEN` | Токен клиентского бота |
| `ADMIN_BOT_TOKEN` | Токен админ-бота |
| `WEBHOOK_SECRET` | Случайная строка ≥32 символов |
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `WEBAPP_URL` | `https://your-app.vercel.app` |
| `API_URL` | Тот же URL (для webhook) |
| `DEMO_MODE` | `false` в проде; `true` только для UI без Telegram |
| `VITE_API_URL` | Пусто или тот же домен (относительные `/api`) |
| `POIZON_API_KEY` | Ключ Poparce (фаза 3) |
| `TON_WALLET_ADDRESS` | Адрес TON для оплаты |

## 4. Деплой

```bash
bun install
bun run build
```

Подключите репозиторий к Vercel. Root directory: корень проекта.

## 5. Webhooks

После деплоя локально с `.env`:

```bash
bun run --cwd apps/api webhook:set
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

## 6. Админ

Telegram ID `156484085` уже в seed. Admin Bot: `/start` → меню заказов.

## 7. Проверка

- `GET https://your-app.vercel.app/health`
- Открыть Mini App из Telegram
- Оформить тестовый заказ → Admin Bot → подтвердить оплату
