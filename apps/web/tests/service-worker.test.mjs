import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://gamescounter.test";
const slugs = ["500", "piratbridge", "gabong", "jonas-spil"];

function worker(network) {
  const listeners = new Map();
  const stores = new Map();
  const calls = [];
  let skipped = false;
  let claimed = false;
  const keyOf = (input) => new URL(
    typeof input === "string" ? input : input.url,
    origin
  ).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) {
          return store.get(keyOf(request))?.clone();
        },
        async put(request, response) {
          store.set(keyOf(request), response.clone());
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  vm.runInNewContext(source, {
    URL,
    Response,
    caches,
    fetch: async (request, options) => {
      const url = keyOf(request);
      calls.push(url);
      return network(url, options);
    },
    self: {
      location: { origin },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
  });

  return {
    caches,
    calls,
    stores,
    get skipped() { return skipped; },
    get claimed() { return claimed; },
    async lifecycle(name) {
      let work;
      listeners.get(name)({ waitUntil: (promise) => { work = promise; } });
      await work;
    },
    async request(path, { mode = "navigate", method = "GET", headers = {} } = {}) {
      let response;
      const work = [];
      listeners.get("fetch")({
        request: { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) },
        respondWith: (promise) => { response = promise; },
        waitUntil: (promise) => work.push(promise),
      });
      const result = await response;
      await Promise.all(work);
      return result;
    },
  };
}

function shellNetwork(url) {
  const path = new URL(url).pathname;
  if (path === "/" || slugs.some((slug) => path === `/games/${slug}`)) {
    return new Response(
      `<h1>${path}</h1>
       <script src="/_next/static/chunks/scorekeeper.js?dpl=test&amp;v=1"></script>
       <link href="/_next/static/styles/app.css" rel="stylesheet">
       <link href="/icons/icon-192.png" rel="icon">
       <link href="https://external.test/track.js">
       <a href="/play">Online</a>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
  if (path.endsWith(".css")) {
    return new Response(
      `@font-face { src: url("../media/font.woff2") }
       .felt { background: url("data:image/svg+xml,%3Csvg filter='url(%23n)'/%3E") }
       .clip { clip-path: url('#mask') }`,
      { headers: { "Content-Type": "text/css" } }
    );
  }
  return new Response("asset");
}

test("installation caches every scorekeeper and its bundles, styles, fonts and icons", async () => {
  const sw = worker(shellNetwork);
  await sw.lifecycle("install");
  assert.equal(sw.skipped, true);
  const cache = await sw.caches.open("games-counter-v2");
  for (const path of [
    "/", ...slugs.map((slug) => `/games/${slug}`),
    "/_next/static/chunks/scorekeeper.js?dpl=test&v=1",
    "/_next/static/styles/app.css",
    "/_next/static/media/font.woff2",
    "/icons/icon-192.png",
  ]) {
    assert.ok(await cache.match(path), `${path} is available offline`);
  }
  assert.equal(sw.calls.some((url) => url.includes("external.test")), false);
  assert.equal(sw.calls.some((url) => url.endsWith("/play")), false);
  assert.equal(sw.calls.filter((url) => url.includes("scorekeeper.js")).length, 1);
});

test("failed shell or asset downloads do not activate an incomplete offline installation", async () => {
  for (const failingPath of ["/games/gabong", "/_next/static/media/font.woff2"]) {
    const sw = worker((url) =>
      new URL(url).pathname === failingPath
        ? new Response("Unavailable", { status: 503 })
        : shellNetwork(url)
    );
    await assert.rejects(sw.lifecycle("install"), /Could not cache offline/);
    assert.equal(sw.skipped, false);
  }
});

test("activation replaces the broken old cache without deleting unrelated caches", async () => {
  const sw = worker(shellNetwork);
  await sw.caches.open("games-counter-v1");
  await sw.caches.open("games-counter-v2");
  await sw.caches.open("another-app");
  await sw.lifecycle("activate");
  assert.deepEqual(await sw.caches.keys(), ["games-counter-v2", "another-app"]);
  assert.equal(sw.claimed, true);
});

test("unvisited new-game, newly generated session and rematch URLs use their own game shell offline", async () => {
  let offline = false;
  const sw = worker((url) => {
    if (offline) throw new TypeError("Network unavailable");
    return shellNetwork(url);
  });
  await sw.lifecycle("install");
  offline = true;
  for (const slug of slugs) {
    for (const suffix of ["", "/new", "/new-session-id", "/new-session-id/rematch"]) {
      const response = await sw.request(`/games/${slug}${suffix}`);
      assert.equal(response.headers.get("Content-Type"), "text/html");
      assert.match(await response.text(), new RegExp(`<h1>/games/${slug}</h1>`));
    }
  }
  assert.match(await (await sw.request("/")).text(), /<h1>\/<\/h1>/);
});

test("RSC, APIs, multiplayer, unknown games, cross-origin and non-GET requests never receive home HTML", async () => {
  const sw = worker(() => { throw new TypeError("Network unavailable"); });
  for (const [path, options] of [
    ["/games/500/new?_rsc=abc", { mode: "cors" }],
    ["/games/500/new", { mode: "cors", headers: { RSC: "1" } }],
    ["/api/gifs", { mode: "cors" }],
    ["/play"],
    ["/play/ABC123/table"],
    ["/games/unknown/new"],
    ["/games/500/new/rematch"],
    ["/games/500/id/unknown"],
    ["/games/500/id/rematch/extra"],
    ["https://server.test/games/500"],
    ["/games/500", { method: "POST" }],
  ]) {
    assert.equal(await sw.request(path, options), undefined, path);
  }
});

test("cached assets are served without the network and missing assets fail instead of returning HTML", async () => {
  let offline = false;
  const sw = worker((url) => {
    if (offline) throw new TypeError("Network unavailable");
    return shellNetwork(url);
  });
  await sw.lifecycle("install");
  const before = sw.calls.length;
  offline = true;
  assert.equal(
    await (await sw.request("/_next/static/media/font.woff2", { mode: "cors" })).text(),
    "asset"
  );
  assert.equal(sw.calls.length, before);
  await assert.rejects(
    sw.request("/_next/static/chunks/missing.js", { mode: "cors" }),
    /Network unavailable/
  );
});

test("online navigations stay network-first and HTTP errors are not hidden by the offline shell", async () => {
  const sw = worker((url) =>
    url.endsWith("/new")
      ? new Response("Not found", { status: 404 })
      : new Response("Fresh screen", { headers: { "Content-Type": "text/html" } })
  );
  const cache = await sw.caches.open("games-counter-v2");
  await cache.put("/games/500", new Response("Old screen"));
  assert.equal(await (await sw.request("/games/500")).text(), "Fresh screen");
  assert.equal(await (await cache.match("/games/500")).text(), "Fresh screen");
  assert.equal((await sw.request("/games/500/new")).status, 404);
});

test("an unavailable shell produces a network error, not a successful home-page fallback", async () => {
  const sw = worker(() => { throw new TypeError("Network unavailable"); });
  const response = await sw.request("/games/500/new");
  assert.equal(response.type, "error");
  assert.equal(response.status, 0);
});
