import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));

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
