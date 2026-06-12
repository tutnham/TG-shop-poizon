export type OrderStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "ton" | "rub_manual" | "usdt_manual";

export interface OrderItemSnapshot {
  product_id: string;
  name: string;
  brand: string | null;
  size: string;
  quantity: number;
  price_rub: number;
  price_usdt: number;
  image_url?: string | null;
}

export interface DeliveryInfo {
  full_name: string;
  phone: string;
  address: string;
  country?: string;
}

export interface OrderListItem {
  id: string;
  short_id: string;
  status: OrderStatus;
  total_rub: number;
  total_usdt: number;
  payment_method: PaymentMethod | null;
  created_at: string;
  items_count: number;
}

export interface OrderDetail extends OrderListItem {
  items: OrderItemSnapshot[];
  delivery_info: DeliveryInfo | null;
  tracking_number: string | null;
  admin_comment: string | null;
}
