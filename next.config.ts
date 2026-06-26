import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Canonical compatibility routes. Keep old bookmarks and any remaining
      // legacy links pointed at the live pages instead of obsolete screens.
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
      {
        source: '/trades/trees',
        destination: '/trades/tracker',
        permanent: true,
      },
      {
        source: '/history/champions',
        destination: '/history?tab=champions',
        permanent: true,
      },
      {
        source: '/history/records',
        destination: '/history?tab=records',
        permanent: true,
      },

      // Around the League previously generated team-name slugs, while the
      // actual team route expects the current Sleeper roster ID. Preserve those
      // links and route each slug to the correct live team dashboard.
      {
        source: '/teams/belltown-raptors',
        destination: '/teams/1',
        permanent: true,
      },
      {
        source: '/teams/double-trouble',
        destination: '/teams/2',
        permanent: true,
      },
      {
        source: '/teams/elemental-heroes',
        destination: '/teams/3',
        permanent: true,
      },
      {
        source: '/teams/mt-lebanon-cake-eaters',
        destination: '/teams/4',
        permanent: true,
      },
      {
        source: '/teams/belleview-badgers',
        destination: '/teams/5',
        permanent: true,
      },
      {
        source: '/teams/beerneverbrokemyheart',
        destination: '/teams/6',
        permanent: true,
      },
      {
        source: '/teams/detroit-dawgs',
        destination: '/teams/7',
        permanent: true,
      },
      {
        source: '/teams/bop-pop',
        destination: '/teams/8',
        permanent: true,
      },
      {
        source: '/teams/minshew-s-maniacs',
        destination: '/teams/9',
        permanent: true,
      },
      {
        source: '/teams/red-pandas',
        destination: '/teams/10',
        permanent: true,
      },
      {
        source: '/teams/the-lone-ginger',
        destination: '/teams/11',
        permanent: true,
      },
      {
        source: '/teams/bimg-bamg-boomg',
        destination: '/teams/12',
        permanent: true,
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/team-prospect-draftboard/scouting': ['./public/scouting-reports.json'],
  },
};

export default nextConfig;
