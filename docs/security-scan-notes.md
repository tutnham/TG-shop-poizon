# Security scan notes

## Local checks (2026-06-15)

- `npm audit --audit-level=high`: 2 high in dev dependency `esbuild` via `vite` (dev server only)
- No hardcoded production secrets in `apps/`

## Auth model (Phase 1)

- **Public read:** catalog, config, rates — no DB guest user
- **Protected write:** cart, orders, user language — require valid `X-Telegram-Init-Data`
- **Image proxy:** requires initData
- **Upsert failure:** returns `503` (fail closed), no synthetic user IDs

## Hardcoded credentials check

- Admin Telegram IDs are stored in `shop_config` via Supabase, not hardcoded
- Webhook secrets enforced ≥32 chars in production (startup-checks.ts)
- Service role key never exposed to client
- Bot tokens only in environment variables

## Cron endpoint

`GET /cron/rates` requires `Authorization: Bearer $CRON_SECRET` in production (`CRON_SECRET` ≥ 32 chars enforced in `startup-checks`).
