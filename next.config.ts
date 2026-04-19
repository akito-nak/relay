import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  serverExternalPackages: [
    '@modelcontextprotocol/sdk',
  ],

  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig