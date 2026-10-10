import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CK Fitness",
    short_name: "CK Fitness",
    description: "Training, progress and accountability.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f9",
    theme_color: "#1b1b36",
  };
}
