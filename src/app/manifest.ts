import type { MetadataRoute } from 'next';

const APP_ICON_URL = '/pwa/east-v-west-logo.png?v=20260725-3';

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
        src: APP_ICON_URL,
        sizes: '500x500',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
