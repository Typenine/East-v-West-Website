'use client';

import { useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function NewsletterPage() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  
  // Generate weeks 1-17 for the archive
  const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Weekly Newsletter" />
      
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{selectedWeek ? `Week ${selectedWeek} Newsletter` : 'Current Newsletter'}</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedWeek ? (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div />
                  <Button variant="ghost" onClick={() => setSelectedWeek(null)}>
                    Back to Current
                  </Button>
                </div>
                <div className="text-center py-12 text-[var(--muted)]">
                  Archive content coming soon
                </div>
              </div>
            ) : (
              <div className="prose max-w-none">
                <p className="text-center py-12 text-lg">Coming Soon</p>
                <p className="text-sm text-[var(--muted)] italic text-center">
                  Weekly newsletters will be automatically generated during the season
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Archive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-2">
              {weeks.map((week) => (
                <Button
                  key={week}
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedWeek(week)}
                  disabled={true}
                >
                  Week {week}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
