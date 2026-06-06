import { ImageResponse } from "next/og";

// Link-preview (Open Graph) image. Renders the same suits-on-felt logo that's
// used for the favicon/app icon, so a shared link shows the app's logo instead
// of a generic placeholder.

export const alt = "Games Counter — score counter for card games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The app logo (mirrors public/icons/icon.svg). Inlined so the image generator
// doesn't depend on filesystem reads at request time.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#1a7d44"/>
      <stop offset="55%" stop-color="#0c5e30"/>
      <stop offset="100%" stop-color="#063e20"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#felt)"/>
  <g transform="translate(79 79) scale(1.7)" fill="#ffffff"><path d="M50 8 C50 8 14 40 14 60 C14 74 26 82 38 78 C40 90 34 94 30 96 L70 96 C66 94 60 90 62 78 C74 82 86 74 86 60 C86 40 50 8 50 8 Z"/></g>
  <g transform="translate(263 79) scale(1.7)" fill="#e23b3b"><path d="M50 90 C50 90 10 62 10 36 C10 20 24 12 38 18 C44 21 48 27 50 32 C52 27 56 21 62 18 C76 12 90 20 90 36 C90 62 50 90 50 90 Z"/></g>
  <g transform="translate(79 263) scale(1.7)" fill="#e23b3b"><path d="M50 6 L92 50 L50 94 L8 50 Z"/></g>
  <g transform="translate(263 263) scale(1.7)" fill="#ffffff"><circle cx="50" cy="30" r="18"/><circle cx="30" cy="58" r="18"/><circle cx="70" cy="58" r="18"/><path d="M44 55 L56 55 L62 92 L38 92 Z"/></g>
</svg>`;

export default function Image() {
  const logo = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          color: "#ffffff",
          background: "#0c5e30",
          backgroundImage:
            "radial-gradient(circle at 50% 34%, #1a7d44 0%, #0c5e30 55%, #063e20 100%)",
        }}
      >
        <img src={logo} width={300} height={300} alt="" />
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -1 }}>
          Games Counter
        </div>
        <div style={{ fontSize: 36, color: "rgba(255,255,255,0.82)" }}>
          500 · Piratbridge · Gabong
        </div>
      </div>
    ),
    { ...size }
  );
}
