export interface NewsletterData {
  id: string;
  title?: string | null;
  status?: 'draft' | 'published';
  episodeType?: string | null;
  week?: number;
  newsletter: {
    meta: {
      leagueName: string;
      week: number;
      date: string;
      season: number;
    };
    sections: Array<{ type: string; data: unknown }>;
  };
  html: string;
  generatedAt: string;
  publishedAt?: string | null;
  fromCache: boolean;
}

export interface NewsletterMeta {
  id: string;
  title: string | null;
  season: number;
  week: number;
  leagueName: string;
  episodeType: string | null;
  status: 'draft' | 'published';
  generatedAt: string;
  publishedAt: string | null;
}

export interface NFLState {
  season: string;
  week: number;
  season_type: string;
}

export interface OutlineItem {
  index: number;
  label: string;
}

export interface NewsletterFrameHandle {
  downloadPdf: (fileName: string, documentTitle: string) => Promise<void>;
  scrollToSection: (index: number) => void;
}
