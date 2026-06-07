# Security scan notes

## Local checks (2026-06-02)

- `npm audit --audit-level=high`: **0 vulnerabilities**
- No hardcoded production secrets in `apps/` (test-only bot token in auth middleware test)

## Hardcoded credentials check

- Admin Telegram IDs are stored in `shop_config` via Supabase, not hardcoded
- Webhook secrets enforced ≥32 chars in production (startup-checks.ts)
- Service role key never exposed to client
- Bot tokens only in environment variables

## Cron endpoint

`GET /cron/rates` requires `Authorization: Bearer $CRON_SECRET` in production (`CRON_SECRET` ≥ 32 chars enforced in `startup-checks`).
