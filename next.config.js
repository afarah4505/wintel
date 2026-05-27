/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
      { protocol: 'https', hostname: 'arweave.net' },
      { protocol: 'https', hostname: '**.ipfs.io' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/dexscreener/:path*',
        destination: 'https://api.dexscreener.com/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
