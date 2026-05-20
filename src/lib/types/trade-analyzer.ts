export interface TradeValue {
  name: string;
  sleeperId: string;
  position: string;
  team: string;
  age?: number;
  value: number; // averaged normalized value (0-10000 scale)
  fcValue: number | null;
  ktcValue: number | null;
  rank: number;
  trend: number;
  isPick: boolean;
}
