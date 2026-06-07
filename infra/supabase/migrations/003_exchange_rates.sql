-- Exchange rates persistence for CBR + Binance

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS rate_cny_usdt NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS rates_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN pricing_config.rate IS 'CNY to RUB (1 CNY in rubles)';
COMMENT ON COLUMN pricing_config.rate_cny_usdt IS 'CNY per 1 USDT (usdt_rub / cny_rub)';
COMMENT ON COLUMN pricing_config.rates_updated_at IS 'Last successful fetch from external APIs';

-- shop_config.value is JSONB NOT NULL, so we don't seed null/pending defaults.
-- The application reads with sensible fallbacks via getConfigValue(key, fallback):
--   usdt_rub         -> Number(fallback) when row missing
--   rates_updated_at -> null when row missing
--   rates_source     -> 'pending'  when row missing
-- persistRates will upsert the real values on the first successful refresh.
