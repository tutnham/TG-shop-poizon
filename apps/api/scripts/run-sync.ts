// Wrapper script to run poizon sync locally (bypasses VERCEL serverless check)
import { loadDotEnv } from "../src/lib/load-dotenv.js";

loadDotEnv();

// Remove VERCEL env var to bypass serverless check
process.env.VERCEL = undefined;

// Dynamically import and run the sync
const { runFullSync } = await import("../src/services/poizon-sync.service.js");
const result = await runFullSync();
console.log(JSON.stringify(result, null, 2));
