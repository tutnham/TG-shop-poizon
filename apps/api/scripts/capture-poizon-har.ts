/**
 * Записывает падающие запросы к Poizon API в .har для отправки в поддержку.
 *
 * Использование:
 *   npx tsx scripts/capture-poizon-har.ts [spuId] [output.har]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

const API_KEY =
  process.env.POIZON_OFFICIAL_API_KEY || process.env.POIZON_API_KEY || "";
const BASE_URL =
  process.env.POIZON_OFFICIAL_API_URL ||
  process.env.POIZON_API_BASE_URL ||
  "https://poizon-api.com/api/dewu";
const SPU_ID = Number(process.argv[2] || "81971");
const OUT_PATH = resolve(
  process.cwd(),
  process.argv[3] || `poizon-api-debug-${SPU_ID}.har`,
);

if (!API_KEY) {
  console.error("POIZON_OFFICIAL_API_KEY или POIZON_API_KEY не задан");
  process.exit(1);
}

type HarHeader = { name: string; value: string };
type HarEntry = {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: HarHeader[];
    queryString: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: HarHeader[];
    content: { size: number; mimeType: string; text: string };
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
};

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

const SENSITIVE_HEADER_NAMES = new Set([
  "set-cookie",
  "authorization",
  "x-api-key",
  "x-auth-token",
  "cookie",
]);

function maskHeaderValue(name: string, value: string): string {
  if (!SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) return value;
  return maskKey(value);
}

function toHarHeaders(headers: Headers): HarHeader[] {
  return [...headers.entries()].map(([name, value]) => ({
    name,
    value: maskHeaderValue(name, value),
  }));
}

async function capture(path: string): Promise<HarEntry> {
  const url = `${BASE_URL}${path}`;
  const started = Date.now();
  const startedDateTime = new Date(started).toISOString();

  const reqHeaders: HarHeader[] = [
    { name: "x-api-key", value: API_KEY },
    { name: "Content-Type", value: "application/json" },
    { name: "Accept", value: "application/json" },
    { name: "User-Agent", value: "TG-shop/1.0 (har-capture)" },
  ];

  const res = await fetch(url, {
    headers: Object.fromEntries(reqHeaders.map((h) => [h.name, h.value])),
    signal: AbortSignal.timeout(30000),
  });

  const text = await res.text();
  const elapsed = Date.now() - started;
  const urlObj = new URL(url);

  return {
    startedDateTime,
    time: elapsed,
    request: {
      method: "GET",
      url,
      httpVersion: "HTTP/1.1",
      headers: reqHeaders.map((h) =>
        h.name === "x-api-key"
          ? { name: h.name, value: maskKey(h.value) }
          : h,
      ),
      queryString: [...urlObj.searchParams.entries()].map(([name, value]) => ({
        name,
        value,
      })),
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: res.status,
      statusText: res.statusText,
      httpVersion: "HTTP/1.1",
      headers: toHarHeaders(res.headers),
      content: {
        size: text.length,
        mimeType: res.headers.get("content-type") ?? "application/json",
        text,
      },
      headersSize: -1,
      bodySize: text.length,
    },
    cache: {},
    timings: { send: 0, wait: elapsed, receive: 0 },
  };
}

async function main(): Promise<void> {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`SPU ID: ${SPU_ID}`);
  console.log(`API key: ${maskKey(API_KEY)} (в HAR замаскирован)`);

  const paths = [
    `/productDetailWithPrice?spuId=${SPU_ID}`,
    `/productDetail?spuId=${SPU_ID}`,
    `/searchProducts?keyword=nike&limit=1&page=0`,
  ];

  const entries: HarEntry[] = [];
  for (const path of paths) {
    console.log(`Capturing ${path}...`);
    try {
      const entry = await capture(path);
      entries.push(entry);
      console.log(`  -> ${entry.response.status} ${entry.response.statusText}`);
    } catch (e) {
      console.warn(`  -> error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const har = {
    log: {
      version: "1.2",
      creator: { name: "TG-shop capture-poizon-har", version: "1.0" },
      comment:
        "Poizon API debug capture for support. x-api-key masked in request headers.",
      entries,
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(har, null, 2), "utf8");
  console.log(`\nHAR saved: ${OUT_PATH}`);
  console.log("Отправьте этот файл в поддержку Poizon API.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
