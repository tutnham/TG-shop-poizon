import { loadDotEnv } from "../src/lib/load-dotenv.js";
import { runFullSync } from "../src/services/poizon-sync.service.js";

loadDotEnv();

const result = await runFullSync();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
