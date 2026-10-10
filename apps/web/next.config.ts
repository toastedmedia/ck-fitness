import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ck/core", "@ck/design-tokens"],
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
