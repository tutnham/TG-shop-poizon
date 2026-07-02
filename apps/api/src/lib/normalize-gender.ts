import type { ProductGender } from "@poizon-shop/shared";

const GENDER_ALIASES: Record<string, ProductGender> = {
  male: "male",
  man: "male",
  men: "male",
  mens: "male",
  "men's": "male",
  муж: "male",
  мужской: "male",
  мужские: "male",
  мужская: "male",
  мужчин: "male",
  男: "male",
  男士: "male",
  男装: "male",

  female: "female",
  woman: "female",
  women: "female",
  womens: "female",
  "women's": "female",
  жен: "female",
  женский: "female",
  женские: "female",
  женская: "female",
  женщин: "female",
  女: "female",
  女士: "female",
  女装: "female",

  unisex: "unisex",
  uni: "unisex",
  neutral: "unisex",
  унисекс: "unisex",
  中性: "unisex",

  kids: "kids",
  kid: "kids",
  child: "kids",
  children: "kids",
  youth: "kids",
  junior: "kids",
  дет: "kids",
  детский: "kids",
  детские: "kids",
  детская: "kids",
  童: "kids",
  儿童: "kids",
};

function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Maps raw gender strings from Poizon/pop2/API dumps to a stable filter value.
 * Unknown values return "unknown" (caller may log for later alias expansion).
 */
export function normalizeProductGender(
  raw: string | null | undefined,
): ProductGender | null {
  if (raw == null || !String(raw).trim()) return null;

  const token = normalizeToken(String(raw));
  if (!token) return null;

  const direct = GENDER_ALIASES[token];
  if (direct) return direct;

  for (const [alias, gender] of Object.entries(GENDER_ALIASES)) {
    if (token.includes(alias) || alias.includes(token)) {
      return gender;
    }
  }

  return "unknown";
}
