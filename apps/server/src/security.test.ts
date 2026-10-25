import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { clientOrigins, generatePlayerCredentials, isAllowedClientOrigin } from "./security";
import { postgresPoolConfig } from "./db";

test("player credentials have 256 bits and do not use Math.random", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Insecure random generator called"); };
  try {
    const credentials = Array.from({ length: 64 }, generatePlayerCredentials);
    assert.equal(new Set(credentials).size, credentials.length);
    for (const value of credentials) assert.match(value, /^[a-f0-9]{64}$/);
  } finally {
    Math.random = original;
  }
});

test("production origins must be explicit HTTPS origins", () => {
  assert.throws(() => clientOrigins({ NODE_ENV: "production" }), /CLIENT_ORIGIN/);
  assert.throws(() => clientOrigins({ RENDER: "true" }), /CLIENT_ORIGIN/);
  const origins = clientOrigins({
    NODE_ENV: "production",
    CLIENT_ORIGIN: "https://game.vercel.app/, https://preview.vercel.app",
  });
  assert.deepEqual(origins, ["https://game.vercel.app", "https://preview.vercel.app"]);
  for (const origin of [
    undefined, "null", "https://attacker.vercel.app",
    "https://game.vercel.app.evil.example", "http://localhost:3000",
  ]) assert.equal(isAllowedClientOrigin(origin, origins), false);
  assert.equal(isAllowedClientOrigin("https://game.vercel.app", origins), true);
  for (const value of [
    "http://game.vercel.app", "https://game.vercel.app/path",
    "https://user:password@game.vercel.app", "https://game.vercel.app?token=x",
    "https://game.vercel.app#fragment", "https://game.vercel.app,",
  ]) assert.throws(() => clientOrigins({ NODE_ENV: "production", CLIENT_ORIGIN: value }));
});

test("development origins do not grant access to every localhost port", () => {
  const origins = clientOrigins({});
  assert.equal(isAllowedClientOrigin("http://localhost:3000", origins), true);
  assert.equal(isAllowedClientOrigin("http://localhost:9999", origins), false);
});

test("remote Postgres always verifies TLS and pg cannot override the policy", () => {
  for (const uri of [
    "postgresql://user:localhost@db.example/game",
    "postgresql://user:password@db.example/localhost?sslmode=require",
    "postgresql://user:password@db.example/game?sslmode=verify-full",
    "postgresql://user:password@localhost.evil.example/game",
    "postgresql://user:password@db.example/game?ssl=true",
  ]) {
    const config = postgresPoolConfig(uri);
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    assert.deepEqual(new pg.Client(config).ssl, { rejectUnauthorized: true });
    const normalized = new URL(config.connectionString!);
    assert.equal(normalized.searchParams.has("sslmode"), false);
    assert.equal(normalized.searchParams.has("ssl"), false);
  }
});

test("PGSSLMODE cannot weaken an external database's effective TLS configuration", () => {
  const previous = process.env.PGSSLMODE;
  process.env.PGSSLMODE = "no-verify";
  try {
    const config = postgresPoolConfig("postgresql://user:password@db.example/game?sslmode=require");
    assert.deepEqual(new pg.Client(config).ssl, { rejectUnauthorized: true });
  } finally {
    if (previous === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = previous;
  }
});

test("only exact loopback database hosts may use plaintext", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(postgresPoolConfig(`postgresql://user:password@${host}/game`).ssl, false);
    assert.deepEqual(
      postgresPoolConfig(`postgresql://user:password@${host}/game?sslmode=verify-full`).ssl,
      { rejectUnauthorized: true }
    );
  }
});

test("unsafe or ambiguous Postgres options fail without leaking the URL", () => {
  for (const suffix of [
    "sslmode=disable", "sslmode=no-verify", "sslmode=prefer", "ssl=false", "ssl=0",
    "sslmode=require&uselibpqcompat=true", "host=localhost", "hostaddr=127.0.0.1",
    "sslrootcert=/some/ca.pem", "sslcert=/some/cert.pem", "sslkey=/some/key.pem",
  ]) {
    assert.throws(
      () => postgresPoolConfig(`postgresql://user:sensitive-password@db.example/game?${suffix}`),
      (error: unknown) => error instanceof Error && !error.message.includes("sensitive-password")
    );
  }
  assert.throws(() => postgresPoolConfig("not-a-database-url"), /valid Postgres/);
  assert.throws(() => postgresPoolConfig("https://db.example/game"), /Postgres host/);
});
