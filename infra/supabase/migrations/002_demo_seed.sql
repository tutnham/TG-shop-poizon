-- Seed data (run after 001_init.sql)

INSERT INTO shop_config (key, value) VALUES
  ('admin_telegram_ids', '[156484085]'),
  ('shop_name', '"Poizon Shop"'),
  ('welcome_message', '"Добро пожаловать в магазин кроссовок и одежды с Poizon"'),
  ('markup_disclaimer_ru', '"Цена включает наценку и пересчёт по актуальному курсу"'),
  ('markup_disclaimer_en', '"Price includes markup and conversion at current rate"'),
  ('payment_instructions_rub', '"Оплата RUB: свяжитесь с менеджером после оформления заказа. Укажите номер заказа."'),
  ('payment_instructions_usdt', '"USDT TRC20: адрес уточняется менеджером. В комментарии укажите номер заказа."'),
  ('ton_wallet_address', '""'),
  ('ton_rate_usd', '2.5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO pricing_config (markup_percent, delivery_fee, currency_pair, rate)
SELECT 25.0, 500, 'CNY_RUB', 13.5
WHERE NOT EXISTS (SELECT 1 FROM pricing_config LIMIT 1);

INSERT INTO categories (name, name_ru, slug, poizon_id) VALUES
  ('Sneakers', 'Кроссовки', 'sneakers', 'demo-1'),
  ('Apparel', 'Одежда', 'apparel', 'demo-2'),
  ('Accessories', 'Аксессуары', 'accessories', 'demo-3')
ON CONFLICT (slug) DO NOTHING;
