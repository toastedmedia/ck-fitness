import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CK Fitness",
    short_name: "CK Fitness",
    description: "Training, progress and accountability.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f1",
    theme_color: "#0f3d2e",
  };
}
