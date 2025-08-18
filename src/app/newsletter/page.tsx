'use client';

import { useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';

export default function NewsletterPage() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  
  // Generate weeks 1-18 for the archive
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Weekly Newsletter" />
      
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
        {selectedWeek ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Week {selectedWeek} Newsletter</h2>
              <button 
                onClick={() => setSelectedWeek(null)}
                className="text-blue-600 hover:text-blue-800"
              >
                Back to Current
              </button>
            </div>
            <div className="text-center py-12 text-gray-500">
              Archive content coming soon
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-6">Current Newsletter</h2>
            <div className="prose max-w-none">
              <p className="text-center py-12 text-lg">Coming Soon</p>
              <p className="text-sm text-gray-500 italic text-center">
                Weekly newsletters will be automatically generated during the season
              </p>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-8">
        <h3 className="text-xl font-bold mb-4">Archive</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-2">
          {weeks.map((week) => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className="p-2 border rounded-md text-center disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={true} // All archives are disabled as per spec
            >
              Week {week}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
