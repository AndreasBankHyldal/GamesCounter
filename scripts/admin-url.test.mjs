import assert from "node:assert/strict";
import test from "node:test";
import { adminServerUrl } from "./admin-url.mjs";

test("admin requests require HTTPS unless the host is exact loopback", () => {
  assert.equal(adminServerUrl("https://games.example").origin, "https://games.example");
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(adminServerUrl(`http://${host}:8000`).protocol, "http:");
  }
  for (const value of [
    "http://games.example", "http://localhost.evil.example",
    "http://localhost@games.example", "https://user:password@games.example",
    "ftp://localhost", "not-a-url",
  ]) assert.throws(() => adminServerUrl(value));
});
