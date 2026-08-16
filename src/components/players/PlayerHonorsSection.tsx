import Card, { CardContent } from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import SectionHeader from '@/components/ui/SectionHeader';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import type { PlayerHonor } from '@/lib/types/player-honors';

function summaryLabels(honors: PlayerHonor[]): string[] {
  const counts = new Map<string, number>();
  for (const honor of honors) counts.set(honor.label, (counts.get(honor.label) || 0) + 1);
  return Array.from(counts.entries()).map(([label, count]) => (count > 1 ? `${count}× ${label}` : label));
}

export default function PlayerHonorsSection({ honors }: { honors: PlayerHonor[] }) {
  if (honors.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Honors" subtitle="East v. West annual awards and All-EVW selections." />
      <div className="mb-3 flex flex-wrap gap-2">
        {summaryLabels(honors).map((label) => <Chip key={label}>{label}</Chip>)}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Season</Th>
                <Th>Honor</Th>
                <Th>Position</Th>
              </Tr>
            </THead>
            <TBody>
              {honors.map((honor) => (
                <Tr key={honor.id}>
                  <Td className="font-semibold">{honor.season}</Td>
                  <Td className="font-semibold">{honor.label}</Td>
                  <Td>{honor.position || '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
