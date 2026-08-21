/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Fail the build on type errors and lint errors — we want a clean deploy.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  // Next.js doesn't serve public/<dir>/index.html at /<dir> — map the clean
  // marketing URLs onto the static landing pages explicitly.
  async rewrites() {
    return [
      { source: "/kurs", destination: "/kurs/index.html" },
      { source: "/akademiya", destination: "/akademiya/index.html" },
    ];
  },
};

export default nextConfig;
