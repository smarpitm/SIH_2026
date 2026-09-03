/** @type {import('next').NextConfig} */
const nextConfig = {
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
