/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['picsum.photos', 'images.unsplash.com', 'cdn.soundwave.com'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  poweredByHeader: false,
  generateEtags: true,
  httpAgentOptions: {
    keepAlive: true,
  },
  async headers() {
    return [
      { source: '/(.*)', headers: [ { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-XSS-Protection', value: '1; mode=block' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' } ] },
      { source: '/api/(.*)', headers: [ { key: 'Cache-Control', value: 'no-store, must-revalidate' } ] },
      { source: '/_next/static/(.*)', headers: [ { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' } ] },
    ];
  },
  async redirects() {
    return [ { source: '/old/(.*)', destination: '/$1', permanent: true } ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { fs: false, net: false, tls: false };
    }
    return config;
  },
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
    optimizePackageImports: ['recharts', 'lucide-react'],
  },
};

export default nextConfig;
