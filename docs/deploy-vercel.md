# Деплой Poizon Shop на Vercel

## 1. Supabase Cloud

1. Создайте проект на https://supabase.com
2. SQL Editor → выполните по порядку:
   - `infra/supabase/migrations/001_init.sql` … `009_create_order_atomic.sql` (см. README, раздел «База данных»)
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
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Секрет из Vercel → Deployment Protection → Protection Bypass for Automation (если включена защита) |
| `CRON_SECRET` | Случайная строка ≥32 символов (Vercel Cron `/cron/rates`) |
| `POIZON_PROVIDER` | `mock` / `poparce` / `official` |
| `POIZON_API_KEY` | Ключ Poparce |
| `POIZON_OFFICIAL_API_URL` / `POIZON_OFFICIAL_API_KEY` | Poizon-API/public-api (позже) |
| `TON_WALLET_ADDRESS` | Адрес TON для оплаты |

## 4. Деплой

**Важно — Root Directory в Vercel:**

- **Settings → General → Root Directory** = пусто (корень репозитория, **не** `apps/api` и **не** `apps/webapp`)
- **Build Command** и **Install Command** — Override **выключен** (берётся из `vercel.json`)
- **Output Directory** — Override **выключен** (в `vercel.json` указано `dist` в корне репозитория)
- **Root Directory** — пусто (`.`). Если указано `apps/webapp`, деплой сломается.

```bash
bun install
bun run build
```

Подключите репозиторий к Vercel. Root directory: **корень проекта** (`.`).

## 5. Webhooks

Если на Vercel включена **Bot Protection** / **Security Checkpoint**, Telegram не сможет достучаться до webhook (получит HTML вместо API). Варианты:

**A (проще):** Vercel → Project → **Settings → Security** → отключите **Attack Challenge Mode** / **Bot Protection** для Production.

**B (безопаснее):** Vercel → **Settings → Deployment Protection** → **Protection Bypass for Automation** → сгенерируйте секрет → добавьте в env как `VERCEL_AUTOMATION_BYPASS_SECRET`. Скрипт `webhook:set` добавит его в URL автоматически.

После деплоя локально с `.env`:

```bash
bun run --cwd apps/api webhook:set
bun run --cwd apps/api rates:update
```

Vercel Cron (в `vercel.json`):

| Путь | Расписание |
|------|------------|
| `GET /cron/rates` | ежедневно 00:00 UTC |
| `GET /cron/webhooks` | ежедневно 01:00 UTC |

Vercel передаёт `Authorization: Bearer <CRON_SECRET>` при совпадении env `CRON_SECRET`.

Ручной вызов webhook-cron:

```bash
npm run cron:webhooks
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

- `GET https://your-app.vercel.app/health` — поля `rates_stale`, `last_rates_at`
- `GET https://your-app.vercel.app/cron/rates` (с Bearer CRON_SECRET) — ручное обновление курсов
- Открыть Mini App из Telegram
- Оформить тестовый заказ → Admin Bot → подтвердить оплату
