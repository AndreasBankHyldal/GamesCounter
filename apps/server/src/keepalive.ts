/**
 * Self-ping to stop Render's free tier from spinning the service down after
 * ~15 min idle. We hit our own PUBLIC url (RENDER_EXTERNAL_URL, injected by
 * Render) so the request counts as inbound traffic. No-op when that env var is
 * absent (e.g. local dev).
 */
export function startKeepAlive(intervalMs = 10 * 60 * 1000): () => void {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) return () => {};

  const url = `${base.replace(/\/$/, "")}/games`;
  const ping = () => {
    fetch(url).catch((err) =>
      console.error("[keepalive] ping failed:", err?.message ?? err)
    );
  };

  const timer = setInterval(ping, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  console.log(
    `[keepalive] pinging ${url} every ${Math.round(intervalMs / 60000)} min`
  );
  return () => clearInterval(timer);
}
