console.log(`
Apply migrations manually in Supabase SQL Editor (strict order):

  1. infra/supabase/migrations/001_init.sql
  2. infra/supabase/migrations/002_demo_seed.sql          (optional, dev only)
  3. infra/supabase/migrations/003_exchange_rates.sql
  4. infra/supabase/migrations/004_perf_indexes.sql
  5. infra/supabase/migrations/005_constraints.sql
  6. infra/supabase/migrations/006_size_prices.sql
  7. infra/supabase/migrations/007_shihuo_product_ids.sql
  8. infra/supabase/migrations/008_rls.sql
  9. infra/supabase/migrations/009_create_order_atomic.sql
 10. infra/supabase/migrations/010_product_filters.sql
 11. infra/supabase/migrations/011_security_hardening.sql

This script is a reminder stub — Supabase CLI migrate is not wired.
Use: npm run db:migrate -w @poizon-shop/api
`);
