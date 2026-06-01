import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { getEnvOptional } from "./types/env.types.js";

const app = createApp();
const port = Number(getEnvOptional("PORT", "3000"));

export default app;

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
  console.log(`API listening on http://localhost:${port}`);
}
