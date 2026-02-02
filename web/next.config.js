/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingExcludes: {
      '*': ['node_modules'],
    },
  },
};

export default nextConfig;
