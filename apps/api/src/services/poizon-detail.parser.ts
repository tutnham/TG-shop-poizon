import {
  mapDetailWithPriceSkus,
  mapGoodsInfoSkuList,
  minPriceFen,
  resolveEnglishTitle,
  type SkuParseResult,
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

/** Нормализует ответ productDetailWithPrice / goodsInfo в PoisonProductRaw */
export function parsePoizonDetailResponse(
  raw: unknown,
  spuIdFallback?: number,
): PoisonProductRaw | null {
  if (!raw || typeof raw !== "object") return null;

  const root = raw as Record<string, unknown>;
  const payload = (
    root.result && typeof root.result === "object"
      ? root.result
      : root
  ) as DetailPayload;

  const detail = payload.detail;
  const spuId =
    detail?.spuId ??
    payload.dwSpuId ??
    spuIdFallback ??
    0;
  if (!spuId) return null;

  const title =
    detail?.title ??
    payload.dwSpuTitle ??
    payload.distSpuTitle ??
    "";
  if (!title && !payload.distSpuTitle) return null;

  const brand =
    detail?.sourceName?.split(" ")[0] ??
    title.split(" ")[0] ??
    "Unknown";

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
