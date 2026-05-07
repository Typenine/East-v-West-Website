import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/team-prospect-draftboard/scouting': ['./prospect-draftboard/public/scouting-reports.json'],
  },
};

export default nextConfig;
