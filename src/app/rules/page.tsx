'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { rulesHtmlSections } from '../../data/rules';
import SectionHeader from '@/components/ui/SectionHeader';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';

// Define the rule section type
type RuleSection = {
  id: string;
  title: string;
  content: string | ReactNode;
  subsections?: RuleSection[];
  searchText?: string;
};

// Strip HTML tags to support plain-text search across rule bodies
const stripTags = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const ruleSections: RuleSection[] = useMemo(() =>
    rulesHtmlSections.map((s) => ({
      id: s.id,
      title: s.title,
      content: (
        <div
          className="space-y-2"
          dangerouslySetInnerHTML={{ __html: s.html }}
        />
      ),
      searchText: stripTags(s.html),
    })),
  []);
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(ruleSections.map((s) => s.id))
  );
  
  // Filter rules based on search query (searches title and body text)
  const q = searchQuery.toLowerCase().trim();
  const filteredSections = q
    ? ruleSections.filter((section) =>
        section.title.toLowerCase().includes(q) || (section.searchText && section.searchText.includes(q))
      )
    : ruleSections;
  
  // Handle clicking on a TOC item
  const handleTOCClick = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Rules" />
      
      {/* Search Bar */}
      <div className="mb-8">
        <Label htmlFor="rules-search" className="mb-1 block">Search rules</Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--muted)]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <Input
            id="rules-search"
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Table of Contents */}
        <div className="md:w-1/4">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Table of Contents</CardTitle>
            </CardHeader>
            <CardContent>
              <nav className="space-y-2">
                {ruleSections.map((section) => (
                  <Button
                    key={section.id}
                    variant={activeSection === section.id ? 'secondary' : 'ghost'}
                    size="sm"
                    fullWidth
                    className="justify-start"
                    onClick={() => handleTOCClick(section.id)}
                  >
                    {section.title}
                  </Button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>
        
        {/* Rules Content */}
        <div className="md:w-3/4">
          {filteredSections.length > 0 ? (
            <div className="space-y-4">
              {filteredSections.map((section) => {
                const isOpen = openSections.has(section.id);
                return (
                  <Card key={section.id} id={section.id} className="scroll-mt-4">
                    <CardHeader>
                      <Button
                        variant="ghost"
                        size="md"
                        fullWidth
                        className="justify-between text-[var(--text)]"
                        aria-expanded={isOpen}
                        aria-controls={`panel-${section.id}`}
                        onClick={() =>
                          setOpenSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(section.id)) next.delete(section.id);
                            else next.add(section.id);
                            return next;
                          })
                        }
                      >
                        <span className="text-lg font-medium">{section.title}</span>
                        <svg
                          className={`w-5 h-5 text-[var(--muted)] ${isOpen ? 'rotate-180' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </Button>
                    </CardHeader>
                    <CardContent id={`panel-${section.id}`} hidden={!isOpen}>
                      {section.content}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[var(--muted)]">No rules found matching your search.</p>
              <Button onClick={() => setSearchQuery('')} className="mt-4">
                Clear Search
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
