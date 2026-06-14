const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, "..", "dist");
const webappDist = path.join(__dirname, "..", "apps", "webapp", "dist");

// Validate webapp build exists
if (!fs.existsSync(webappDist)) {
  console.error(`ERROR: Webapp dist not found at ${webappDist}`);
  console.error("Run 'npm run build -w @poizon-shop/webapp' first");
  process.exit(1);
}

// Validate it has an index.html
if (!fs.existsSync(path.join(webappDist, "index.html"))) {
  console.error("ERROR: Webapp dist missing index.html");
  process.exit(1);
}

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(webappDist, distDir, { recursive: true });

console.log(`✓ Webapp dist copied to ${distDir}`);
