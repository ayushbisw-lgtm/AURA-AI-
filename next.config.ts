import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep `next dev` artifacts separate from production builds so they cannot
  // overwrite each other's manifests or webpack chunks.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};
export default nextConfig;
