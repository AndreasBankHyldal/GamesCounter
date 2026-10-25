export function adminServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SERVER_URL must be an absolute HTTP(S) URL");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username || url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new Error("SERVER_URL requires HTTPS except for local loopback development");
  }
  return url;
}
