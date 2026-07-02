import { z } from "zod";

export const ProductGenderSchema = z.enum([
  "male",
  "female",
  "unisex",
  "kids",
  "unknown",
]);

export const ProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().optional(),
  brand: z.string().optional(),
  search: z.string().optional(),
  sort: z
    .enum(["popular", "price_asc", "price_desc", "new"])
    .default("popular"),
  min_price: z.coerce.number().optional(),
  max_price: z.coerce.number().optional(),
  size: z.string().min(1).max(20).optional(),
  gender: ProductGenderSchema.optional(),
});

export const AddToCartSchema = z.object({
  product_id: z.string().uuid(),
  size: z.string().min(1).max(20),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(10).optional(),
  size: z.string().min(1).max(20).optional(),
});

export const CreateOrderSchema = z.object({
  payment_method: z
    .enum(["ton", "rub_manual", "usdt_manual", "none"])
    .default("none"),
  delivery_info: z.object({
    full_name: z.string().min(2).max(120),
    phone: z.string().min(5).max(30),
    address: z.string().min(5).max(500),
    country: z.string().max(60).optional(),
  }),
});

export const UpdateLanguageSchema = z.object({
  language_code: z.enum(["ru", "en"]),
});

export const ImportProductSchema = z.object({
  query: z.string().trim().min(1).max(200),
});
