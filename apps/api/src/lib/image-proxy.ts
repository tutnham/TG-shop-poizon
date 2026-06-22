import { getEnvOptional } from "../types/env.types.js";

const DEFAULT_ALLOWED_HOSTS = [
  "images.unsplash.com",
  "cdn.poizon.com",
  "img.poizon.com",
  "static.poizon.com",
  "static.shihuocdn.cn",
  "shihuocdn.cn",
  "poparce.ru",
];

export function getAllowedImageHosts(): Set<string> {
  const extra = getEnvOptional("IMAGE_PROXY_ALLOWED_HOSTS")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...extra]);
}

export function isAllowedImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
    const host = parsed.hostname.toLowerCase();
    const allowed = getAllowedImageHosts();
    if (allowed.has(host)) return true;
    return [...allowed].some(
      (pattern) => host === pattern || host.endsWith(`.${pattern}`),
    );
  } catch {
    return false;
  }
}
