import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/team-prospect-draftboard/scouting': ['./public/scouting-reports.json'],
  },
};

export default nextConfig;
