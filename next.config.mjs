/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 14 loads instrumentation.ts behind this flag (stable in 15).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
