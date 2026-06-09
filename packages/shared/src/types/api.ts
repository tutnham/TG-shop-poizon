export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

export type Result<T, E = { message: string; code?: string; status?: number }> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export interface ShopConfigPublic {
  shop_name: string;
  welcome_message: string;
  markup_disclaimer_ru: string;
  markup_disclaimer_en: string;
  last_synced_at: string | null;
}
