const CACHE = "games-counter-v2";
const GAME_SLUGS = ["500", "piratbridge", "gabong", "jonas-spil"];
const APP_SHELL = ["/", ...GAME_SLUGS.map((slug) => `/games/${slug}`)];

function isAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/favicon.ico")
  );
}

function shellFor(pathname) {
  if (pathname === "/") return "/";
  const [prefix, slug, sessionId, action, ...rest] = pathname
    .split("/")
    .filter(Boolean);
  if (
    prefix !== "games" ||
    !GAME_SLUGS.includes(slug) ||
    rest.length ||
    (action && (action !== "rematch" || sessionId === "new"))
  ) {
    return undefined;
  }
  return `/games/${slug}`;
}

function assetURLs(source, base, pattern) {
  const urls = new Set();
  for (const match of source.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value.startsWith("#")) continue;
    const url = new URL(value.replaceAll("&amp;", "&"), base);
    if (isAsset(url)) urls.add(url.href);
  }
  return urls;
}

async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  await Promise.all(
    APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("text/html")) {
        throw new Error(`Could not cache offline screen: ${path}`);
      }
      const html = await response.clone().text();
      await cache.put(path, response);
      for (const url of assetURLs(
        html,
        self.location.origin,
        /(?:src|href)=["']([^"']+)["']/g
      )) {
        assets.add(url);
      }
    })
  );

  // Cache referenced bundles and CSS fonts before declaring offline support ready.
  const pending = new Map();
  function cacheAsset(url) {
    if (pending.has(url)) return pending.get(url);
    const task = (async () => {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not cache offline asset: ${url}`);
      const css = response.headers.get("Content-Type")?.includes("text/css")
        ? await response.clone().text()
        : "";
      await cache.put(url, response);
      await Promise.all(
        [...assetURLs(
          css,
          url,
          /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/g
        )].map(cacheAsset)
      );
    })();
    pending.set(url, task);
    return task;
  }
  await Promise.all([...assets].map(cacheAsset));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache()
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error("Offline screens could not be downloaded.", error);
        throw error;
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("games-counter-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request, shell, event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).pathname === shell) {
      event.waitUntil(cache.put(shell, response.clone()));
    }
    return response;
  } catch {
    return (await cache.match(shell)) ?? Response.error();
  }
}

async function assetResponse(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    const shell = shellFor(url.pathname);
    if (shell) event.respondWith(navigationResponse(request, shell, event));
  } else if (isAsset(url)) {
    event.respondWith(assetResponse(request, event));
  }
});
