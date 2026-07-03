# Poizon data providers

The API isolates product sync behind `IPoisonProvider`. Switch providers with `POIZON_PROVIDER`.

## Providers

| Value | Class | When to use |
|-------|--------|-------------|
| `mock` | `MockPoisonProvider` | Local UI/dev without keys |
| `poparce` | `PoparcePoisonProvider` | Third-party DEWU API (`POIZON_API_KEY`) |
| `official` | `PoizonOfficialProvider` | [Poizon-API/public-api](https://github.com/Poizon-API/public-api) (Basic tier) |

**Default:** `mock` if `POIZON_PROVIDER` is unset and `POIZON_API_KEY` is empty. If `POIZON_API_KEY` is set without an explicit provider — `poparce`.

## Official API (poizon-api.com)

Implemented in `PoizonOfficialProvider`.

Set in `.env`:

```env
POIZON_PROVIDER=official
POIZON_OFFICIAL_API_URL=https://poizon-api.com/api/dewu
POIZON_OFFICIAL_API_KEY=<your key>
```

Endpoints (from [OpenAPI spec](http://poizon-api.com/api/dewu/api-json)):
- `GET /searchProducts` — keyword search
- `GET /productDetailWithPrice` — product card + price
- `GET /getCategories` — categories (RU/EN/ZH)

## Price mapping

Poizon returns prices in **fen** (1 CNY = 100 fen). Sync uses:

```ts
const cny = priceFen / 100
calculatePricesFromFen(priceFen, pricingConfig)
```

Rates: CBR (CNY/RUB) + Binance (USDT/RUB), refreshed **daily** via Vercel Cron (`GET /cron/rates`, `0 0 * * *`) or manually:

```bash
npm run rates:update
```

## Sync limits on Vercel

`runFullSync` may exceed the 60s serverless limit. Prefer running from a long-running host or CI:

```bash
npm run sync:poizon
```

See also [optimization-backlog.md](./optimization-backlog.md).
