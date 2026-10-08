import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GreenLedger",
    short_name: "GreenLedger",
    description:
      "Inventory for greenhouse farms — inputs, plants, harvests, sales and equipment.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#1e6b45",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
