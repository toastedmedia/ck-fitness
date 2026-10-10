import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@ck/core", "@ck/design-tokens"],
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Never cache anything that is personal or admin.
      {
        source:
          "/(home|progress|accountability|profile|membership|notifications|admin)/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
