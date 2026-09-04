/** @type {import('next').NextConfig} */
const nextConfig = {
  // AUDIT FINDING (dev/build isolation): `next build` (NODE_ENV=production) and
  // `next dev` (NODE_ENV=development) write to DIFFERENT output directories —
  // a build can never corrupt a running dev server's cache again (they used to
  // share .next). Override either side with NEXT_DIST_DIR if you need to.
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === "production" ? ".next-build" : ".next"),
  // Next 14 loads instrumentation.ts behind this flag (stable in 15).
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["bullmq"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        "node:crypto": false,
      };
    }
    return config;
  },
};

export default nextConfig;
