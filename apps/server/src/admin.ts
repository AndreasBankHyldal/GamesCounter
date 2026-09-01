import { timingSafeEqual } from "node:crypto";
import type Router from "@koa/router";
import type { StorageAPI } from "boardgame.io";
import type { KeepAliveController } from "./keepalive";

type Db = StorageAPI.Async | StorageAPI.Sync;

export function isBearerAuthorized(
  header: string | undefined,
  secret: string
): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;

  const actual = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function matchSummaries(db: Db) {
  const ids = await Promise.resolve(db.listMatches());
  const summaries = await Promise.all(
    ids.map(async (matchID) => {
      const { metadata } = await Promise.resolve(db.fetch(matchID, { metadata: true }));
      if (!metadata) return null;
      const players = Object.values(metadata.players ?? {});
      return {
        matchID,
        gameName: metadata.gameName,
        gameover: metadata.gameover !== undefined,
        connectedPlayers: players.filter((player) => player?.isConnected).length,
        playerCount: players.filter((player) => player?.name).length,
        updatedAt: metadata.updatedAt,
      };
    })
  );
  return summaries.filter((summary) => summary !== null);
}

export function configureAdminRoutes(
  router: Router,
  db: Db,
  keepAlive: KeepAliveController,
  secret = process.env.ADMIN_SECRET
): boolean {
  if (!secret) return false;

  const requireAdmin: Router.Middleware = async (ctx, next) => {
    if (!isBearerAuthorized(ctx.get("authorization"), secret)) {
      ctx.set("WWW-Authenticate", "Bearer");
      ctx.status = 401;
      ctx.body = { error: "Unauthorized" };
      return;
    }
    await next();
  };

  router.get("/admin/keepalive/status", requireAdmin, async (ctx) => {
    ctx.body = {
      keepAlive: keepAlive.getStatus(),
      matches: await matchSummaries(db),
    };
  });

  router.post("/admin/keepalive/sleep", requireAdmin, (ctx) => {
    keepAlive.sleepUntilActivity();
    ctx.body = {
      keepAlive: keepAlive.getStatus(),
      message: "Self-pinging stopped; persisted matches were not changed.",
    };
  });

  return true;
}
