import {
  type SkuParseResult,
  mapDetailWithPriceSkus,
  mapGoodsInfoSkuList,
  minPriceFen,
  resolveEnglishTitle,
} from "./poizon-sku.mapper.js";
import type { PoisonProductRaw } from "./poizon.provider.js";

type DetailPayload = {
  detail?: {
    spuId?: number;
    title?: string;
    structureTitle?: string;
    originalTitle?: string;
    logoUrl?: string;
    status?: number;
    soldCountText?: string;
    sourceName?: string;
    articleNumber?: string;
  };
  price?: { item?: { price?: number } };
  image?: { spuImage?: { images?: Array<{ url: string }> } };
  skus?: Parameters<typeof mapDetailWithPriceSkus>[0];
  distSpuTitle?: string;
  dwSpuTitle?: string;
  dwSpuId?: number;
  baseImage?: string[];
  skuList?: Parameters<typeof mapGoodsInfoSkuList>[0];
};

type PriceInfoSku = {
  quantity?: number;
  prices?: Array<{ price?: number; floorPrice?: number }>;
};

/** Merge /productDetail skus with /priceInfo map into productDetailWithPrice shape. */
export function mergeOfficialDetailWithPriceInfo(
  detailRaw: unknown,
  priceInfoRaw: unknown,
): unknown {
  if (!detailRaw || typeof detailRaw !== "object") return detailRaw;

  const detailRoot = detailRaw as Record<string, unknown>;
  const detailPayload = (
    detailRoot.result && typeof detailRoot.result === "object"
      ? detailRoot.result
      : detailRoot
  ) as Record<string, unknown>;

  if (!priceInfoRaw || typeof priceInfoRaw !== "object") return detailRaw;

  const priceRoot = priceInfoRaw as Record<string, unknown>;
  const pricePayload =
    priceRoot.result && typeof priceRoot.result === "object"
      ? (priceRoot.result as Record<string, unknown>)
      : priceRoot;
  const skusMap = pricePayload.skus as Record<string, PriceInfoSku> | undefined;
  if (!skusMap || typeof skusMap !== "object") return detailRaw;

  const detailSkus = detailPayload.skus;
  if (!Array.isArray(detailSkus)) return detailRaw;

  const mergedSkus = detailSkus.map((sku) => {
    if (!sku || typeof sku !== "object") return sku;
    const row = sku as Record<string, unknown>;
    const skuId = row.skuId;
    if (skuId == null) return sku;

    const priceEntry = skusMap[String(skuId)];
    if (!priceEntry?.prices?.length) return sku;

    return {
      ...row,
      status: row.status ?? 1,
      price: { prices: priceEntry.prices },
    };
  });

  const mergedPayload = { ...detailPayload, skus: mergedSkus };
  if (detailRoot.result && typeof detailRoot.result === "object") {
    return { ...detailRoot, result: mergedPayload };
  }
  return mergedPayload;
}

/** Нормализует ответ productDetailWithPrice / goodsInfo в PoisonProductRaw */
export function parsePoizonDetailResponse(
  raw: unknown,
  spuIdFallback?: number,
): PoisonProductRaw | null {
  if (!raw || typeof raw !== "object") return null;

  const root = raw as Record<string, unknown>;
  const payload = (
    root.result && typeof root.result === "object" ? root.result : root
  ) as DetailPayload;

  const detail = payload.detail;
  const spuId = detail?.spuId ?? payload.dwSpuId ?? spuIdFallback ?? 0;
  if (!spuId) return null;

  const title =
    detail?.title ?? payload.dwSpuTitle ?? payload.distSpuTitle ?? "";
  if (!title && !payload.distSpuTitle) return null;

  const brand =
    detail?.sourceName?.split(" ")[0] ?? title.split(" ")[0] ?? "Unknown";

  const englishTitle = resolveEnglishTitle({
    distSpuTitle: payload.distSpuTitle,
    structureTitle: detail?.structureTitle,
    originalTitle: detail?.originalTitle,
    title,
    brand,
    articleNumber: detail?.articleNumber,
  });

  let skuData: SkuParseResult;
  if (payload.skuList?.length) {
    skuData = mapGoodsInfoSkuList(payload.skuList);
  } else if (payload.skus?.length) {
    skuData = mapDetailWithPriceSkus(payload.skus);
  } else {
    skuData = { sizePricesFen: {}, stock: {}, sizes: [] };
  }

  const fallbackFen = Number(payload.price?.item?.price ?? 0);
  const priceFen = minPriceFen(skuData.sizePricesFen, fallbackFen);

  const images =
    payload.image?.spuImage?.images?.map((i) => i.url) ??
    (payload.baseImage?.length ? payload.baseImage : undefined) ??
    (detail?.logoUrl ? [detail.logoUrl] : []);

  const inStock =
    detail?.status === 1 ||
    Object.values(skuData.stock).some(Boolean) ||
    priceFen > 0;

  return {
    spuId,
    title,
    englishTitle,
    brand,
    logoUrl: detail?.logoUrl ?? images[0] ?? "",
    priceFen,
    inStock,
    images,
    sizes: skuData.stock,
    sizePricesFen: skuData.sizePricesFen,
    soldCount: Number.parseInt(detail?.soldCountText ?? "0", 10) || 0,
  };
}
