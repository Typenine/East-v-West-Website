import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/trade-block',
        destination: '/trades/block',
        permanent: true,
      },
      {
        source: '/brackets',
        destination: '/history?tab=brackets',
        permanent: true,
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/team-prospect-draftboard/scouting': ['./public/scouting-reports.json'],
  },
};

export default nextConfig;
