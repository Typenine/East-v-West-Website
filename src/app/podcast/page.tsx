import type { Metadata } from 'next';
import SectionHeader from '@/components/ui/SectionHeader';
import LinkButton from '@/components/ui/LinkButton';
import Card, { CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';

export const metadata: Metadata = {
  title: 'Podcast • East v. West Fantasy Football',
  description: 'Listen to the East v. West Fantasy Football league podcast on Spotify or Apple Podcasts.',
};

const SPOTIFY_SHOW_URL = 'https://open.spotify.com/show/0Dha8Mnml3OZOZTbQtTEgz';
const SPOTIFY_EMBED_URL = 'https://open.spotify.com/embed/show/0Dha8Mnml3OZOZTbQtTEgz?utm_source=generator&theme=0';

const APPLE_PODCAST_URL = 'https://podcasts.apple.com/us/podcast/west-vs-east-ffl-podcast/id1769326488';
const APPLE_EMBED_URL = 'https://embed.podcasts.apple.com/us/podcast/west-vs-east-ffl-podcast/id1769326488';

export default function PodcastPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <SectionHeader title="East v. West Podcast" className="mx-auto max-w-fit" />
        <p className="text-[var(--muted)] mt-2">
          League talk, matchup previews, trades, and weekly storylines. Choose your platform below to listen.
        </p>
      </div>

      <Tabs
        initialId="spotify"
        tabs={[
          {
            id: 'spotify',
            label: 'Spotify',
            content: (
              <Card className="hover-lift">
                <CardHeader>
                  <CardTitle>Listen on Spotify</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full">
                    <iframe
                      title="Spotify show embed"
                      src={SPOTIFY_EMBED_URL}
                      width="100%"
                      height="360"
                      style={{ border: 0, borderRadius: '12px' }}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <span className="text-[var(--muted)] text-sm">Opens in Spotify</span>
                  <LinkButton href={SPOTIFY_SHOW_URL} target="_blank" rel="noopener noreferrer" variant="primary">
                    Open on Spotify
                  </LinkButton>
                </CardFooter>
              </Card>
            ),
          },
          {
            id: 'apple',
            label: 'Apple Podcasts',
            content: (
              <Card className="hover-lift">
                <CardHeader>
                  <CardTitle>Listen on Apple Podcasts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full">
                    <iframe
                      allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                      frameBorder="0"
                      height="450"
                      style={{ width: '100%', overflow: 'hidden', background: 'transparent', borderRadius: '12px' }}
                      sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                      title="Apple Podcasts show embed"
                      src={APPLE_EMBED_URL}
                      loading="lazy"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <span className="text-[var(--muted)] text-sm">Opens in Apple Podcasts</span>
                  <LinkButton href={APPLE_PODCAST_URL} target="_blank" rel="noopener noreferrer" variant="primary">
                    Open on Apple Podcasts
                  </LinkButton>
                </CardFooter>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
