import CountdownTimer from '@/components/ui/countdown-timer';
import SectionHeader from '@/components/ui/SectionHeader';
import { getCountdownCards } from '@/lib/utils/countdown-resolver';

export default function HomepageCountdowns() {
  const [card1, card2] = getCountdownCards();
  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="Key dates" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CountdownTimer targetDate={card1.targetDate} title={card1.title} emphasis />
        <CountdownTimer targetDate={card2.targetDate} title={card2.title} emphasis />
      </div>
    </section>
  );
}
