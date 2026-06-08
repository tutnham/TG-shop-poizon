import type { ExchangeRate, RateSnapshot } from "./rate-types.js";

// ── Интерфейс репозитория кеша курсов ───────────────────────────────
export interface ExchangeRateCacheRepository {
  getCnyRub(): ExchangeRate | null;
  setCnyRub(rate: ExchangeRate): void;
  getUsdtRub(): ExchangeRate | null;
  setUsdtRub(rate: ExchangeRate): void;
  /** Возвращает снимок, только если ОБА курса есть в кеше */
  getSnapshot(): RateSnapshot | null;
  /** Очистить кеш (для принудительного обновления) */
  invalidate(): void;
}

// ── In-Memory реализация ────────────────────────────────────────────
export class InMemoryExchangeRateCacheRepository
  implements ExchangeRateCacheRepository
{
  private cnyRub: ExchangeRate | null = null;
  private usdtRub: ExchangeRate | null = null;

  getCnyRub(): ExchangeRate | null {
    return this.cnyRub;
  }

  setCnyRub(rate: ExchangeRate): void {
    this.cnyRub = rate;
  }

  getUsdtRub(): ExchangeRate | null {
    return this.usdtRub;
  }

  setUsdtRub(rate: ExchangeRate): void {
    this.usdtRub = rate;
  }

  getSnapshot(): RateSnapshot | null {
    if (!this.cnyRub || !this.usdtRub) return null;
    return this._buildSnapshot(this.cnyRub, this.usdtRub);
  }

  invalidate(): void {
    this.cnyRub = null;
    this.usdtRub = null;
  }

  private _buildSnapshot(
    cnyRub: ExchangeRate,
    usdtRub: ExchangeRate,
  ): RateSnapshot {
    // usdtCny = usdtRub / cnyRub (кросс-курс)
    const usdtCny = usdtRub.rate.div(cnyRub.rate);
    return {
      cnyRub,
      usdtRub,
      usdtCny,
      computedAt: new Date().toISOString(),
    };
  }
}
