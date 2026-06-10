import { redirect } from 'next/navigation';

// The trade tree experience lives in the tracker (visual lineage tree with a
// player search to root it). This page previously rendered a permanently
// empty placeholder; keep the route alive and send visitors to the real tool.
export default function TradeTreesPage() {
  redirect('/trades/tracker');
}
