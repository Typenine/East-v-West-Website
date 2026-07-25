'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

type AppNavItemProps = {
  active: boolean;
  children: ReactNode;
  href: string;
  icon: ReactNode;
  onClick: () => void;
};

const LEAGUE_PATHS = ['/standings', '/calendar', '/rosters', '/rules', '/rivalries', '/votes'];
const HIDDEN_PATHS = ['/admin', '/login', '/offline', '/draft/overlay', '/draft/room'];

function pathMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function AppNavItem({ active, children, href, icon, onClick }: AppNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${
        active
          ? 'bg-accent-soft text-accent'
          : 'text-[var(--muted)] active:bg-[var(--surface-strong)] active:text-[var(--text)]'
      }`}
    >
      <span className="flex h-6 w-8 items-center justify-center">{icon}</span>
      <span className="max-w-full truncate">{children}</span>
    </Link>
  );
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function getMobileMenuButton(): HTMLButtonElement | null {
  const button = document.getElementById('mobile-menu-button');
  return button instanceof HTMLButtonElement ? button : null;
}

export default function MobileAppNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    let observer: MutationObserver | null = null;

    const attach = () => {
      const button = getMobileMenuButton();
      if (!button) {
        frame = window.requestAnimationFrame(attach);
        return;
      }

      const sync = () => setMenuOpen(button.getAttribute('aria-expanded') === 'true');
      sync();
      observer = new MutationObserver(sync);
      observer.observe(button, { attributes: true, attributeFilter: ['aria-expanded'] });
    };

    attach();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const button = getMobileMenuButton();
    if (button?.getAttribute('aria-expanded') === 'true') {
      button.click();
    }
  }, [pathname]);

  const closeMenu = () => {
    const button = getMobileMenuButton();
    if (button?.getAttribute('aria-expanded') === 'true') {
      button.click();
    }
  };

  const toggleMenu = () => {
    getMobileMenuButton()?.click();
  };

  if (HIDDEN_PATHS.some((prefix) => pathMatches(pathname, prefix))) {
    return null;
  }

  const homeActive = pathname === '/';
  const leagueActive = LEAGUE_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const transactionsActive = pathMatches(pathname, '/transactions');
  const draftActive = pathMatches(pathname, '/draft');
  const primaryActive = homeActive || leagueActive || transactionsActive || draftActive;
  const moreActive = menuOpen || !primaryActive;

  return (
    <nav
      data-mobile-app-nav
      aria-label="Mobile app navigation"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-[var(--border)] bg-[var(--surface)]/95 shadow-[0_-8px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 gap-1 px-2 py-1.5">
        <AppNavItem
          href="/"
          active={homeActive}
          onClick={closeMenu}
          icon={
            <NavIcon>
              <path d="m3 10 9-7 9 7" />
              <path d="M5 9v11h14V9" />
              <path d="M9 20v-6h6v6" />
            </NavIcon>
          }
        >
          Home
        </AppNavItem>

        <AppNavItem
          href="/standings"
          active={leagueActive}
          onClick={closeMenu}
          icon={
            <NavIcon>
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
              <path d="M7 6H4v1a4 4 0 0 0 4 4" />
              <path d="M17 6h3v1a4 4 0 0 1-4 4" />
            </NavIcon>
          }
        >
          League
        </AppNavItem>

        <AppNavItem
          href="/transactions"
          active={transactionsActive}
          onClick={closeMenu}
          icon={
            <NavIcon>
              <path d="M4 7h13" />
              <path d="m14 4 3 3-3 3" />
              <path d="M20 17H7" />
              <path d="m10 14-3 3 3 3" />
            </NavIcon>
          }
        >
          Transactions
        </AppNavItem>

        <AppNavItem
          href="/draft?view=next"
          active={draftActive}
          onClick={closeMenu}
          icon={
            <NavIcon>
              <path d="M5 4h14v16H5z" />
              <path d="M9 4V2h6v2" />
              <path d="m8.5 11 2 2 5-5" />
            </NavIcon>
          }
        >
          Draft
        </AppNavItem>

        <button
          type="button"
          onClick={toggleMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className={`flex min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${
            moreActive
              ? 'bg-accent-soft text-accent'
              : 'text-[var(--muted)] active:bg-[var(--surface-strong)] active:text-[var(--text)]'
          }`}
        >
          <span className="flex h-6 w-8 items-center justify-center">
            <NavIcon>
              <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
            </NavIcon>
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
