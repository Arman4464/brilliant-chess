import type { NextConfig } from "next"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined
const bp = basePath || ""

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  basePath,
  assetPrefix: basePath ? basePath + "/" : undefined,
  distDir: process.env.VERCEL ? undefined : "dist",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig