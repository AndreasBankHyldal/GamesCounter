# GamesCounter's local boardgame.io fork

Private workspace version `0.50.2-gamescounter.1`, based on the **MIT-licensed**
upstream `boardgame.io@0.50.2` npm distribution. This is a local version, not an
upstream security release. The original [LICENSE](LICENSE) and source copyright
notices are retained.

## Provenance

- Upstream tag: `v0.50.2`
- Upstream commit: `2945c30e536517cf819e000f33d9d08bacaac297`
- Archive: <https://registry.npmjs.org/boardgame.io/-/boardgame.io-0.50.2.tgz>
- Verified SHA-512 integrity:
  `sha512-oEcgtiDidTk2Mvweg3issGxOxMwOTTPlkHMoLexQ0LTQJXl60P3vA026SLYy313nrHM6s/vK7qE7TavMFxyC0g==`

`src/` retains the relevant published source. `lib/cjs`, `lib/esm` and
`lib/types` are the corresponding upstream distribution files, originally under
`dist/`, with the security changes below applied. They are checked in so installs
do not execute a build or lifecycle hook. Subpath manifests point to `lib/`.

## Intentional changes

- Remove the bundled Svelte debugger, Svelte dependencies, debugger entrypoint,
  debugger chunks and the unused CDN/React Native bundles that include them.
  Game rules, state formats and existing match data are not rewritten.
- Clients and React wrappers default to `debug: false`. Explicit use of the
  removed built-in debugger throws; a separately supplied `debug.impl` remains
  supported. GamesCounter already disables the debugger in every client.
- Fix Socket.IO's `cors.origin` spelling, and accept partial Socket.IO options
  so the application can enforce its handshake policy with `allowRequest`.
- Do not reuse a custom room-ID `uuid` function as the default credential
  generator. GamesCounter supplies its own 256-bit credential generator.
- Use CORS 5 and Socket.IO 4. Root workspace overrides also patch the old
  `koa-socket-2` wrapper's Socket.IO dependency and the parser, Engine.IO and ws.
  Removing the wrapper itself is not required for the current fixes.
- Omit upstream development dependencies, tests, build/lifecycle scripts and
  unused debugger/React Native entrypoints. Optional React peers allow the
  headless server to use the same package as the React 19 web client.

## Maintaining the fork

Apply each source change to the matching CJS/ESM runtime and declaration files;
do not edit only `src/` and assume a build will regenerate `lib/`. The published
game reducers, rules, storage API and wire format remain upstream 0.50.2 code.
Review any replacement upstream archive against the provenance above, preserve
its license, and re-audit both dependencies and embedded runtime code.

From the repository root, the focused regression checks are:

```bash
node --test packages/boardgame.io/fork.test.mjs
node --import tsx --test apps/server/src/multiplayer-security.test.ts
```

They cover CJS/ESM and React clients, absence of bundled Svelte, authenticated
multiplayer sync, hidden hands, moves, chat, reconnect, origin restrictions,
credential generation and a headless 500 round transition. Network fixtures
bind only `127.0.0.1` on ephemeral ports and use in-memory storage.
