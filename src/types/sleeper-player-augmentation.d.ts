import '@/lib/utils/sleeper-api';

declare module '@/lib/utils/sleeper-api' {
  interface SleeperPlayer {
    full_name?: string;
  }
}
