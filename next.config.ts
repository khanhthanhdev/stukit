import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  pageExtensions: ["md", "mdx", "ts", "tsx"],

  images: {
    remotePatterns: [
      { hostname: `${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com` },
      { hostname: "stukit-bucket.s3.us-east-1.amazonaws.com" },
      { hostname: "**.amazonaws.com" },
    ],
  },
}

export default createMDX({})(nextConfig)
