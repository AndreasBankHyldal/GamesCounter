import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Games Counter",
    short_name: "Games",
    description:
      "Score counter for card games like 500, Piratbridge and Gabong.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c5e30",
    theme_color: "#063e20",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
