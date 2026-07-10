import { NextResponse } from "next/server";

// Server-side proxy for the Klipy GIF API. Keeps KLIPY_API_KEY off the client
// and normalizes Klipy's response into a small, stable shape the chat consumes.
//
// Klipy (https://klipy.com) — free lifetime hobby tier; replaces Tenor (shut down
// 2026) / Giphy (now paid). The API key lives in the URL path:
//   Search:   GET https://api.klipy.com/api/v1/{KEY}/gifs/search?q=&per_page=&page=
//   Trending: GET https://api.klipy.com/api/v1/{KEY}/gifs/trending?per_page=
// Response:   { result, data: { data: [ items… ], has_next, … } }
// Each item exposes its media under `file`/`files`, keyed by quality (hd/md/sm/xs)
// then format (gif/webp/mp4). We defensively extract a full + preview GIF url.

const KLIPY_BASE = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;

/** Our normalized GIF shape returned to the client. */
export interface GifResult {
  id: string;
  url: string; // full-size GIF
  preview: string; // smaller GIF for the picker grid
  width?: number;
  height?: number;
  alt: string;
}

type Unknown = Record<string, unknown>;

function asRecord(v: unknown): Unknown | undefined {
  return v && typeof v === "object" ? (v as Unknown) : undefined;
}

/** A `{ url, width, height }` GIF entry within a Klipy quality tier. */
function gifOfTier(tier: unknown): { url: string; width?: number; height?: number } | null {
  const gif = asRecord(asRecord(tier)?.gif);
  const url = gif?.url;
  if (typeof url === "string" && url) {
    const width = typeof gif.width === "number" ? gif.width : undefined;
    const height = typeof gif.height === "number" ? gif.height : undefined;
    return { url, width, height };
  }
  return null;
}

/** Last-resort: recursively find the first `.gif` URL anywhere in the item. */
function deepFindGif(value: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (typeof value === "string") return /\.gif(\?|$)/i.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = deepFindGif(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const rec = asRecord(value);
  if (!rec) return null;
  for (const v of Object.values(rec)) {
    const found = deepFindGif(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalize(item: unknown): GifResult | null {
  const rec = asRecord(item);
  if (!rec) return null;
  const files = asRecord(rec.file) ?? asRecord(rec.files);

  const tier = (q: string) => (files ? gifOfTier(files[q]) : null);
  const full = tier("hd") ?? tier("md") ?? tier("sm") ?? tier("xs");
  const preview = tier("sm") ?? tier("xs") ?? tier("md") ?? full;

  const url = full?.url ?? deepFindGif(rec);
  if (!url) return null;

  const id = String(rec.id ?? rec.slug ?? url);
  const alt = typeof rec.title === "string" && rec.title ? rec.title : "GIF";
  return {
    id,
    url,
    preview: preview?.url ?? url,
    width: full?.width,
    height: full?.height,
    alt,
  };
}

export async function GET(request: Request) {
  const key = process.env.KLIPY_API_KEY;
  if (!key) {
    // No key configured — tell the client so it can hide the GIF button.
    return NextResponse.json({ configured: false, results: [] as GifResult[] });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const endpoint = q
    ? `${KLIPY_BASE}/${key}/gifs/search?q=${encodeURIComponent(q)}&per_page=${PER_PAGE}&page=1`
    : `${KLIPY_BASE}/${key}/gifs/trending?per_page=${PER_PAGE}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      // Cache trending briefly; searches are effectively per-query.
      next: { revalidate: q ? 0 : 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { configured: true, results: [] as GifResult[], error: "provider_error" },
        { status: 502 }
      );
    }
    const json = (await res.json()) as Unknown;
    const inner = asRecord(json.data);
    const list = Array.isArray(inner?.data)
      ? inner!.data
      : Array.isArray(json.data)
        ? (json.data as unknown[])
        : [];
    const results = list
      .map(normalize)
      .filter((g): g is GifResult => g !== null);
    return NextResponse.json({ configured: true, results });
  } catch {
    return NextResponse.json(
      { configured: true, results: [] as GifResult[], error: "fetch_failed" },
      { status: 502 }
    );
  }
}
