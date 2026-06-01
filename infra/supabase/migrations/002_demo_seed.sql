-- Demo seed data (run after 001_init.sql)

INSERT INTO shop_config (key, value) VALUES
  ('admin_telegram_ids', '[156484085]'),
  ('shop_name', '"Poizon Shop"'),
  ('welcome_message', '"Добро пожаловать в магазин кроссовок и одежды с Poizon"'),
  ('markup_disclaimer_ru', '"Цена включает наценку и пересчёт по актуальному курсу"'),
  ('markup_disclaimer_en', '"Price includes markup and conversion at current rate"'),
  ('hide_demo_products', 'false'),
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

-- Demo products
INSERT INTO products (poizon_id, name, name_ru, brand, category_id, image_urls, is_available, price_cny, price_rub, price_usdt, sizes, stock, sold_count, source, synced_at)
SELECT
  v.poizon_id, v.name, v.name_ru, v.brand,
  (SELECT id FROM categories WHERE slug = v.cat_slug LIMIT 1),
  ARRAY[v.img], true, v.price_cny, v.price_rub, v.price_usdt,
  v.sizes::jsonb, v.stock::jsonb, v.sold, 'demo', NOW()
FROM (VALUES
  ('demo-nike-dunk', 'Nike Dunk Low Panda', 'Nike Dunk Low Panda', 'Nike', 'sneakers', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', 450, 9200, 101.5, '{"EU":["40","41","42","43"]}', '{"40":true,"41":true,"42":false,"43":true}', 1240),
  ('demo-jordan-1', 'Air Jordan 1 Retro High', 'Air Jordan 1 Retro High', 'Jordan', 'sneakers', 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400', 520, 11500, 127.0, '{"EU":["41","42","43","44"]}', '{"41":true,"42":true,"43":true,"44":false}', 890),
  ('demo-adidas-samba', 'Adidas Samba OG', 'Adidas Samba OG', 'Adidas', 'sneakers', 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400', 380, 7800, 86.2, '{"EU":["39","40","41","42"]}', '{"39":true,"40":true,"41":true,"42":true}', 2100),
  ('demo-yeezy-350', 'Yeezy Boost 350 V2', 'Yeezy Boost 350 V2', 'Yeezy', 'sneakers', 'https://images.unsplash.com/photo-1605348539785-510c209a0f37?w=400', 680, 14200, 157.5, '{"EU":["42","43","44","45"]}', '{"42":true,"43":false,"44":true,"45":true}', 560),
  ('demo-nb-550', 'New Balance 550', 'New Balance 550', 'New Balance', 'sneakers', 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400', 420, 8800, 97.3, '{"EU":["40","41","42"]}', '{"40":true,"41":true,"42":true}', 430),
  ('demo-travis-aj1', 'Travis Scott x AJ1 Low', 'Travis Scott x AJ1 Low', 'Jordan', 'sneakers', 'https://images.unsplash.com/photo-1556906781-95a6e8a8fb8f?w=400', 1200, 28500, 315.0, '{"EU":["42","43"]}', '{"42":true,"43":true}', 320),
  ('demo-dior-b22', 'Dior B22 Runner', 'Dior B22 Runner', 'Dior', 'sneakers', 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=400', 2100, 52000, 575.0, '{"EU":["41","42","43"]}', '{"41":false,"42":true,"43":true}', 89),
  ('demo-nike-tech', 'Nike Tech Fleece Hoodie', 'Nike Tech Fleece худи', 'Nike', 'apparel', 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', 280, 6200, 68.5, '{"EU":["S","M","L","XL"]}', '{"S":true,"M":true,"L":true,"XL":false}', 670),
  ('demo-supreme-tee', 'Supreme Box Logo Tee', 'Supreme Box Logo футболка', 'Supreme', 'apparel', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400', 350, 8900, 98.4, '{"EU":["M","L","XL"]}', '{"M":true,"L":true,"XL":true}', 1200),
  ('demo-cap-ny', 'New Era Yankees Cap', 'Кепка New Era Yankees', 'New Era', 'accessories', 'https://images.unsplash.com/photo-1588850561407-ed78c282e808?w=400', 120, 3200, 35.4, '{"EU":["ONE"]}', '{"ONE":true}', 890),
  ('demo-bag-lv', 'LV Keepall Bandouliere', 'LV Keepall Bandouliere', 'Louis Vuitton', 'accessories', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400', 4500, 98000, 1083.0, '{"EU":["ONE"]}', '{"ONE":true}', 45),
  ('demo-asics-gel', 'Asics Gel-Kayano 14', 'Asics Gel-Kayano 14', 'Asics', 'sneakers', 'https://images.unsplash.com/photo-1600185365926-3a2e3a9e6b3b?w=400', 400, 8500, 94.0, '{"EU":["40","41","42","43"]}', '{"40":true,"41":true,"42":true,"43":true}', 780)
) AS v(poizon_id, name, name_ru, brand, cat_slug, img, price_cny, price_rub, price_usdt, sizes, stock, sold)
ON CONFLICT (poizon_id) DO NOTHING;
