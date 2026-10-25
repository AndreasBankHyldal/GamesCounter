import { randomBytes } from "node:crypto";
import type { Middleware } from "koa";

export function generatePlayerCredentials(): string {
  return randomBytes(32).toString("hex");
}

export function clientOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const production = env.NODE_ENV === "production" || env.RENDER === "true";
  const configured = env.CLIENT_ORIGIN?.trim();
  if (production && !configured) {
    throw new Error("CLIENT_ORIGIN must be configured in production");
  }

  const values = configured
    ? configured.split(",").map((value) => value.trim())
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

  return [...new Set(values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("CLIENT_ORIGIN must contain absolute HTTP(S) origins");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" ||
      (production && url.protocol !== "https:")
    ) {
      throw new Error("CLIENT_ORIGIN must contain origins only; production requires HTTPS");
    }
    return url.origin;
  }))];
}

export function isAllowedClientOrigin(
  origin: string | undefined,
  origins: readonly string[]
): boolean {
  return origin !== undefined && origins.includes(origin);
}

export function enforceBrowserOrigin(origins: readonly string[]): Middleware {
  return async (ctx, next) => {
    const origin = ctx.get("Origin");
    if (origin && !isAllowedClientOrigin(origin, origins)) {
      ctx.status = 403;
      ctx.body = { error: "Origin not allowed" };
      return;
    }
    await next();
  };
}
