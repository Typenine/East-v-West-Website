'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import GlobalSearch from '@/components/ui/global-search';

const navItems = [
  { name: 'Home', path: '/' },
  { name: 'Teams', path: '/teams' },
  { name: 'Standings', path: '/standings' },
  { name: 'Rules', path: '/rules' },
  { name: 'History', path: '/history' },
  { name: 'Draft', path: '/draft' },
  { name: 'Newsletter', path: '/newsletter' },
  { name: 'Trades', path: '/trades' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-slate-800 text-white" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="font-bold text-xl">East v. West</Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      pathname === item.path
                        ? 'bg-slate-900 text-white'
                        : 'text-gray-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
                <div className="px-3 py-2">
                  <GlobalSearch />
                </div>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center">
            <GlobalSearch />
          </div>
          <div className="md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-white"
              aria-controls="mobile-menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {/* Icon when menu is closed */}
              <svg
                className={`${mobileMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              {/* Icon when menu is open */}
              <svg
                className={`${mobileMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      <div
        className={`${mobileMenuOpen ? 'block' : 'hidden'} md:hidden`}
        id="mobile-menu"
        role="menu"
        aria-labelledby="mobile-menu-button"
      >
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.path}
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                pathname === item.path
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-300 hover:bg-slate-700 hover:text-white'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
