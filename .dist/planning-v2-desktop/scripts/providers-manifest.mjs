import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const providersDir = path.join(rootDir, "public", "providers");
const outputPublic = path.join(providersDir, "manifest.json");
const outputGenerated = path.join(rootDir, "src", "generated", "providersManifest.json");

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function main() {
  if (!fs.existsSync(providersDir)) {
    throw new Error(`providers dir not found: ${providersDir}`);
  }

  const files = fs.readdirSync(providersDir).filter((name) => !name.startsWith("."));
  const svg = [];
  const png = [];

  for (const fileName of files) {
    const parsed = path.parse(fileName);
    if (!/^\d{7}$/.test(parsed.name)) continue;
    if (parsed.ext.toLowerCase() === ".svg") svg.push(parsed.name);
    if (parsed.ext.toLowerCase() === ".png") png.push(parsed.name);
  }

  const manifest = { svg: uniqueSorted(svg), png: uniqueSorted(png) };
  fs.mkdirSync(path.dirname(outputPublic), { recursive: true });
  fs.mkdirSync(path.dirname(outputGenerated), { recursive: true });
  fs.writeFileSync(outputPublic, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  fs.writeFileSync(outputGenerated, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  console.log(`[providers:manifest] svg=${manifest.svg.length} png=${manifest.png.length}`);
  console.log(`[providers:manifest] wrote ${path.relative(rootDir, outputPublic)}`);
  console.log(`[providers:manifest] wrote ${path.relative(rootDir, outputGenerated)}`);
}

main();

