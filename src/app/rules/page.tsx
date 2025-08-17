'use client';

import { useState } from 'react';
import { Disclosure } from '@headlessui/react';
import { rulesHtmlSections } from '../../data/rules';

// Define the rule section type
type RuleSection = {
  id: string;
  title: string;
  content: string | React.ReactNode;
  subsections?: RuleSection[];
  searchText?: string;
};

// Strip HTML tags to support plain-text search across rule bodies
const stripTags = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  // Define the rules content
  const ruleSections: RuleSection[] = rulesHtmlSections.map((s) => ({
    id: s.id,
    title: s.title,
    content: (
      <div
        className="space-y-2"
        dangerouslySetInnerHTML={{ __html: s.html }}
      />
    ),
    searchText: stripTags(s.html),
  }));
  
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
      <h1 className="text-3xl font-bold text-center mb-8">League Rules</h1>
      
      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Table of Contents */}
        <div className="md:w-1/4">
          <div className="bg-gray-100 p-4 rounded-lg sticky top-4">
            <h2 className="font-bold text-lg mb-4">Table of Contents</h2>
            <nav className="space-y-1">
              {ruleSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleTOCClick(section.id)}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-md ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </div>
        
        {/* Rules Content */}
        <div className="md:w-3/4">
          {filteredSections.length > 0 ? (
            <div className="space-y-8">
              {filteredSections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-4">
                  <Disclosure defaultOpen={true}>
                    {({ open }) => (
                      <>
                        <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-lg font-medium text-left text-gray-900 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus-visible:ring focus-visible:ring-gray-500 focus-visible:ring-opacity-75">
                          <span>{section.title}</span>
                          {open ? (
                            <svg
                              className="w-5 h-5 text-gray-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                fillRule="evenodd"
                                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-5 h-5 text-gray-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </Disclosure.Button>
                        <Disclosure.Panel className="px-4 pt-4 pb-2 text-gray-700">
                          {section.content}
                        </Disclosure.Panel>
                      </>
                    )}
                  </Disclosure>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No rules found matching your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
