-- 005: Add missing constraints and indexes for production safety

-- Order status enum constraint
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status IN ('pending', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Positive total constraints
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_total_rub_positive CHECK (total_rub >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_total_usdt_positive CHECK (total_usdt >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cart quantity must be positive
DO $$ BEGIN
  ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0 AND quantity <= 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_product ON cart_items(user_id, product_id);
