import type { NextConfig } from "next"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  basePath,
  assetPrefix: basePath ? basePath + "/" : undefined,
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: `${process.env.NEXT_PUBLIC_BASE_PATH}/(.*)`,
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        source: `${process.env.NEXT_PUBLIC_BASE_PATH}/engine/(.*)`,
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ]
  }
}

export default nextConfig