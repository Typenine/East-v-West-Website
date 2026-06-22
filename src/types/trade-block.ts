export type TradeAsset =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; year: number; round: number; originalTeam: string }
  | { type: 'faab'; amount?: number };

export type TradeWants = {
  text?: string;
  positions?: string[];
  contactMethod?: 'text' | 'discord' | 'snap' | 'sleeper';
  phone?: string;
  snap?: string;
};

export type TeamRow = {
  team: string;
  tradeBlock: TradeAsset[];
  tradeWants: TradeWants | null;
  updatedAt: string | null;
};
