import { getEnvOptional } from "../types/env.types.js";
import type { IPoisonProvider, PoisonProductRaw } from "./poizon.provider.js";

const NOT_CONFIGURED =
  "Poizon official API not configured. Set POIZON_OFFICIAL_API_URL and POIZON_OFFICIAL_API_KEY, or use POIZON_PROVIDER=poparce|mock.";
const NOT_IMPLEMENTED =
  "Poizon official API integration is a stub. Implement searchProducts/getProductDetail/getCategories when API keys are available.";

const PLACEHOLDER_HOSTS = new Set(["api.poizon-api.example"]);

/**
 * Stub for https://github.com/Poizon-API/public-api (Basic tier).
 * Implement search/detail/categories when API keys are available.
 */
export class PoizonOfficialProvider implements IPoisonProvider {
  private baseUrl(): string {
    return getEnvOptional(
      "POIZON_OFFICIAL_API_URL",
      "https://api.poizon-api.example",
    );
  }

  private apiKey(): string | undefined {
    return getEnvOptional("POIZON_OFFICIAL_API_KEY");
  }

  private ensureConfigured(): void {
    const key = this.apiKey();
    let host = "";
    try {
      host = new URL(this.baseUrl()).host;
    } catch {
      host = this.baseUrl();
    }
    if (!key || PLACEHOLDER_HOSTS.has(host)) {
      throw new Error(NOT_CONFIGURED);
    }
  }

  async searchProducts(
    _keyword: string,
    _limit: number,
    _page: number,
  ): Promise<{
    items: PoisonProductRaw[];
    hasMore: boolean;
    total: number;
  }> {
    this.ensureConfigured();
    throw new Error(NOT_IMPLEMENTED);
  }

  async getProductDetail(_spuId: number): Promise<PoisonProductRaw | null> {
    this.ensureConfigured();
    throw new Error(NOT_IMPLEMENTED);
  }

  async getCategories(
    _lang: "RU" | "EN" | "ZH",
  ): Promise<{ id: number; name: string }[]> {
    this.ensureConfigured();
    throw new Error(NOT_IMPLEMENTED);
  }
}
