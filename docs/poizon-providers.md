# Poizon data providers

The API isolates product sync behind `IPoisonProvider`. Switch providers with `POIZON_PROVIDER`.

## Providers

| Value | Class | When to use |
|-------|--------|-------------|
| `mock` | `MockPoisonProvider` | Local UI/dev without keys |
| `poparce` | `PoparcePoisonProvider` | Current third-party DEWU API (`POIZON_API_KEY`) |
| `official` | `PoizonOfficialProvider` | [Poizon-API/public-api](https://github.com/Poizon-API/public-api) (Basic tier) |

Default (empty `POIZON_PROVIDER`): `poparce` if `POIZON_API_KEY` is set, otherwise `mock`.

## Official API (poizon-api.com)

Готово к использованию. Реализован в `PoizonOfficialProvider`.

Set in `.env`:

```env
POIZON_PROVIDER=official
POIZON_OFFICIAL_API_URL=https://poizon-api.com/api/dewu
POIZON_OFFICIAL_API_KEY=<your key>
```

Эндпоинты (из [OpenAPI-спеки](http://poizon-api.com/api/dewu/api-json)):
- `GET /searchProducts` — поиск по ключевому слову
- `GET /productDetailWithPrice` — карточка товара + цена
- `GET /getCategories` — категории (RU/EN/ZH)

## Price mapping

Poizon returns prices in **fen** (1 CNY = 100 fen). Sync uses:

```ts
const cny = priceFen / 100
calculatePricesFromFen(priceFen, pricingConfig)
```

Rates for conversion come from CBR (CNY/RUB) + Binance (USDT/RUB), refreshed hourly via Vercel Cron or `bun run rates:update`.

## Sync limits on Vercel

`runFullSync` may exceed the 30s serverless limit. Prefer:

```bash
bun run --cwd apps/api sync:poizon
```

from CI or a long-running host.
