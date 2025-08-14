'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TEAM_NAMES } from '@/lib/constants/league';

// Define search result types
type SearchResultItem = {
  title: string;
  path: string;
  type: 'team' | 'page' | 'trade' | 'rule';
  description?: string;
};

// Define search categories
const searchablePages = [
  { title: 'Home', path: '/', type: 'page' as const },
  { title: 'Teams', path: '/teams', type: 'page' as const },
  { title: 'Standings', path: '/standings', type: 'page' as const },
  { title: 'Rules', path: '/rules', type: 'page' as const },
  { title: 'History', path: '/history', type: 'page' as const },
  { title: 'Draft', path: '/draft', type: 'page' as const },
  { title: 'Newsletter', path: '/newsletter', type: 'page' as const },
  { title: 'Trades', path: '/trades', type: 'page' as const },
  { title: 'Trade Trees', path: '/trades/trees', type: 'page' as const },
];

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle search query changes
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    // Search logic
    const searchResults: SearchResultItem[] = [];
    const lowerQuery = query.toLowerCase();

    // Search teams
    TEAM_NAMES.forEach((team, index) => {
      if (team.toLowerCase().includes(lowerQuery)) {
        searchResults.push({
          title: team,
          path: `/teams/${index + 1}`,
          type: 'team',
          description: 'Team Page'
        });
      }
    });

    // Search pages
    searchablePages.forEach(page => {
      if (page.title.toLowerCase().includes(lowerQuery)) {
        searchResults.push({
          title: page.title,
          path: page.path,
          type: 'page',
          description: 'Page'
        });
      }
    });

    // Limit results to top 10
    setResults(searchResults.slice(0, 10));
    setSelectedIndex(0);
  }, [query]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard shortcuts and navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        if (!isOpen && inputRef.current) {
          setTimeout(() => {
            inputRef.current?.focus();
          }, 100);
        }
      }

      // Escape to close search
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }

      // Arrow navigation for results
      if (isOpen && results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          window.location.href = results[selectedIndex].path;
          setIsOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, results, selectedIndex]);

  // Focus input when search opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={searchRef}>
      {/* Search button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-gray-300 hover:bg-slate-700 hover:text-white rounded-md flex items-center"
        aria-label="Open search"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="ml-2 hidden md:inline">Search</span>
        <span className="ml-2 hidden md:inline text-xs text-gray-400">(Ctrl+K)</span>
      </button>

      {/* Search modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-16 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-heading"
        >
          <div 
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-haspopup="listbox"
          >
            <div className="p-4 border-b">
              <h2 id="search-heading" className="sr-only">Search East v West</h2>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search teams, pages, and more..."
                  className="ml-2 flex-1 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-autocomplete="list"
                  aria-controls="search-results"
                />
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Results */}
            <div 
              id="search-results" 
              className="max-h-96 overflow-y-auto p-2"
              role="listbox"
              aria-labelledby="search-heading"
            >
              {results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((result, index) => (
                    <Link
                      key={`${result.type}-${result.path}`}
                      href={result.path}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center p-3 rounded-md transition-colors ${
                        index === selectedIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'
                      }`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      tabIndex={0}
                    >
                      {/* Icon based on result type */}
                      {result.type === 'team' && (
                        <span className="bg-blue-100 text-blue-800 p-1 rounded mr-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </span>
                      )}
                      {result.type === 'page' && (
                        <span className="bg-green-100 text-green-800 p-1 rounded mr-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </span>
                      )}
                      <div>
                        <div className="font-medium">{result.title}</div>
                        <div className="text-sm text-gray-500">{result.description}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : query.length >= 2 ? (
                <div className="px-4 py-8 text-center text-gray-500" role="status">
                  No results found for &quot;{query}&quot;
                </div>
              ) : null}

              {query.length < 2 && (
                <div className="px-4 py-8 text-center text-gray-500">
                  Type at least 2 characters to search
                </div>
              )}
            </div>

            {/* Keyboard shortcuts */}
            <div className="bg-gray-50 px-4 py-3 text-xs text-gray-500 flex justify-between">
              <div>
                <span className="bg-gray-200 px-2 py-1 rounded">↑↓</span> to navigate
              </div>
              <div>
                <span className="bg-gray-200 px-2 py-1 rounded">Enter</span> to select
              </div>
              <div>
                <span className="bg-gray-200 px-2 py-1 rounded">Esc</span> to close
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
