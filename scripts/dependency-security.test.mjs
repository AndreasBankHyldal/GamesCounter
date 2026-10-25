import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));

test("nanoid 3 lock entries and the local fork match the root override", async () => {
  const readJson = async (path) => JSON.parse(await readFile(
    new URL(path, import.meta.url), "utf8"
  ));
  const [root, fork, lock] = await Promise.all([
    readJson("../package.json"),
    readJson("../packages/boardgame.io/package.json"),
    readJson("../package-lock.json"),
  ]);
  const expected = root.overrides["nanoid@^3"];
  assert.equal(fork.dependencies.nanoid, expected);
  const entries = Object.entries(lock.packages).filter(([path, pkg]) =>
    (path === "node_modules/nanoid" || path.endsWith("/node_modules/nanoid")) &&
    pkg.version.startsWith("3.")
  );
  assert.ok(entries.length > 0);
  for (const [path, pkg] of entries) assert.equal(pkg.version, expected, path);
});

test("Vercel installs the committed workspace lock without lifecycle scripts", async () => {
  const config = JSON.parse(await readFile(
    new URL("../apps/web/vercel.json", import.meta.url), "utf8"
  ));
  assert.equal(config.installCommand, "npm ci --ignore-scripts --legacy-peer-deps");
});

test("sharp's prebuilt runtime works without lifecycle scripts", async () => {
  const sharp = webRequire("sharp");
  const image = await sharp({
    create: {
      width: 1, height: 1, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
  assert.equal(metadata.format, "png");
});
