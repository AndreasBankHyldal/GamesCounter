import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const cjs = require("./lib/cjs/client.js");
const esm = await import("./lib/esm/client.js");
const reactCjs = require("./lib/cjs/react.js");
const reactEsm = await import("./lib/esm/react.js");
const game = {
  setup: () => ({ count: 0 }),
  moves: { increment: ({ G }) => { G.count++; } },
};

for (const [name, { Client }] of [["CJS", cjs], ["ESM", esm]]) {
  test(`${name} clients default to debugger-free play and reject the removed debugger`, () => {
    const client = Client({ game });
    client.start();
    try {
      client.moves.increment();
      assert.equal(client.getState().G.count, 1);
    } finally {
      client.stop();
    }
    assert.throws(() => Client({ game, debug: true }), /bundled debugger was removed/);
    assert.throws(() => Client({ game, debug: {} }), /bundled debugger was removed/);
  });
}

for (const [name, { Client }] of [["CJS", reactCjs], ["ESM", reactEsm]]) {
  test(`${name} React wrapper retains the client API without loading a debugger`, () => {
    const Component = Client({ game });
    assert.equal(Component.defaultProps.debug, false);
    const wrapper = new Component({ ...Component.defaultProps });
    wrapper.client.start();
    try {
      wrapper.client.moves.increment();
      assert.equal(wrapper.client.getState().G.count, 1);
      assert.equal(wrapper.render().type, "div");
    } finally {
      wrapper.client.stop();
    }
  });
}

test("distributed runtimes do not retain a Svelte import or bundled debugger", async () => {
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies.svelte, undefined);
  assert.equal(pkg.dependencies["svelte-json-tree-auto"], undefined);
  for (const dir of ["lib/cjs/", "lib/esm/"]) {
    const base = new URL(dir, import.meta.url);
    for (const file of await readdir(base)) {
      assert.equal(file.startsWith("Debug-"), false);
      if (file.endsWith(".js")) {
        const code = await readFile(new URL(file, base), "utf8");
        assert.doesNotMatch(code, /svelte|Debug-[a-f0-9]+/);
      }
    }
  }
});
