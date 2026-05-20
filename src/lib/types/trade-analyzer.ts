export interface TradeValue {
  name: string;
  sleeperId: string;
  position: string;
  team: string;
  age?: number;
  value: number; // avg of fcValue + ktcValue (or just fcValue if KTC unavailable), raw 0-10000 scale
  fcValue: number | null;
  ktcValue: number | null;
  rank: number;
  trend: number;
  isPick: boolean;
}
