import assert from "node:assert/strict";
import test from "node:test";
import { isBearerAuthorized } from "./admin";

test("admin bearer token must exactly match the configured secret", () => {
  const secret = "a-secure-admin-secret";

  assert.equal(isBearerAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(isBearerAuthorized(`Bearer ${secret}-extra`, secret), false);
  assert.equal(isBearerAuthorized("Bearer wrong", secret), false);
  assert.equal(isBearerAuthorized(secret, secret), false);
  assert.equal(isBearerAuthorized(undefined, secret), false);
});
