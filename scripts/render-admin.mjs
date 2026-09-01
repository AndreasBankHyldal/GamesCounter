import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseConfig(contents) {
  const config = {};
  for (const [index, originalLine] of contents.split(/\r?\n/).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error(`Invalid admin config on line ${index + 1}`);
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    config[key] = value;
  }
  return config;
}

const action = process.argv[2];
if (action !== "status" && action !== "sleep") {
  throw new Error("Usage: node scripts/render-admin.mjs <status|sleep>");
}

const configPath = resolve(
  process.env.RENDER_ADMIN_CONFIG ?? ".env.render-admin"
);
const fileConfig = existsSync(configPath)
  ? parseConfig(await readFile(configPath, "utf8"))
  : {};
const serverUrl = process.env.SERVER_URL ?? fileConfig.SERVER_URL;
const adminSecret = process.env.ADMIN_SECRET ?? fileConfig.ADMIN_SECRET;

if (!serverUrl) {
  throw new Error(`SERVER_URL is missing. Copy scripts/render-admin.env.example to ${configPath}.`);
}
if (!adminSecret) {
  throw new Error(`ADMIN_SECRET is missing. Add it to ${configPath}.`);
}

const baseUrl = new URL(serverUrl);
if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
  throw new Error("SERVER_URL must use http or https");
}

const endpoint =
  action === "status"
    ? "/admin/keepalive/status"
    : "/admin/keepalive/sleep";
const response = await fetch(new URL(endpoint, baseUrl), {
  method: action === "status" ? "GET" : "POST",
  headers: { Authorization: `Bearer ${adminSecret}` },
});
const body = await response.text();

if (!response.ok) {
  throw new Error(`Admin request failed (${response.status}): ${body}`);
}

const parsed = JSON.parse(body);
console.log(JSON.stringify(parsed, null, 2));
