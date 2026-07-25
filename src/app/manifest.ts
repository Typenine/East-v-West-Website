import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'East v. West Fantasy Football',
    short_name: 'East v. West',
    description: 'The official East v. West dynasty fantasy football league app.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#08111f',
    theme_color: '#08111f',
    lang: 'en-US',
    categories: ['sports', 'entertainment'],
    icons: [
      {
        src: '/pwa/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/pwa/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/assets/teams/East%20v%20West%20Logos/Official%20East%20v.%20West%20Logo.png',
        sizes: '500x500',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
