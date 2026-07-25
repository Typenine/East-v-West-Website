'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { USER_NAV_CONFIG, type UserNavItem } from '@/lib/constants/navigation';

type AppNavItemProps = {
  active: boolean;
  children: ReactNode;
  href: string;
  icon: ReactNode;
  onClick: () => void;
};

type AppNavButtonProps = {
  active: boolean;
  children: ReactNode;
  controls: string;
  expanded: boolean;
  icon: ReactNode;
  onClick: () => void;
};

type SectionKey = 'league' | 'transactions';

const HIDDEN_PATHS = ['/admin', '/login', '/offline', '/draft/overlay', '/draft/room'];

const leagueConfigItems = USER_NAV_CONFIG.find((item) => item.id === 'league')?.children ?? [];
const LEAGUE_ITEMS: UserNavItem[] = leagueConfigItems.some((item) => item.href === '/calendar')
  ? leagueConfigItems
  : leagueConfigItems.flatMap((item) =>
      item.id === 'league.standings'
        ? [
            item,
            {
              id: 'league.calendar',
              label: 'League Calendar',
              href: '/calendar',
              description: 'Important dates and weekly matchups',
            },
          ]
        : [item],
    );

const TRANSACTION_ITEMS = USER_NAV_CONFIG.find((item) => item.id === 'transactions')?.children ?? [];
const LEAGUE_PATHS = LEAGUE_ITEMS.flatMap((item) => (item.href ? [item.href.split('?')[0]] : []));
const TRANSACTION_PATHS = TRANSACTION_ITEMS.flatMap((item) => (item.href ? [item.href.split('?')[0]] : []));

function pathMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function navItemClasses(active: boolean): string {
  return `flex min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${
    active
      ? 'bg-accent-soft text-accent'
      : 'text-[var(--muted)] active:bg-[var(--surface-strong)] active:text-[var(--text)]'
  }`;
}

function AppNavItem({ active, children, href, icon, onClick }: AppNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={navItemClasses(active)}
    >
      <span className="flex h-6 w-8 items-center justify-center">{icon}</span>
      <span className="max-w-full truncate">{children}</span>
    </Link>
  );
}

function AppNavButton({ active, children, controls, expanded, icon, onClick }: AppNavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      className={navItemClasses(active)}
    >
      <span className="flex h-6 w-8 items-center justify-center">{icon}</span>
      <span className="max-w-full truncate">{children}</span>
    </button>
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

function SectionSheet({
  items,
  onClose,
  section,
  title,
}: {
  items: UserNavItem[];
  onClose: () => void;
  section: SectionKey;
  title: string;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Close ${title} menu`}
        onClick={onClose}
        className="fixed inset-x-0 top-0 z-[64] bg-black/45 md:hidden"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      />
      <section
        id={`mobile-${section}-menu`}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} navigation`}
        className="fixed left-3 right-3 z-[75] mx-auto max-h-[calc(100dvh-8.5rem)] max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl md:hidden"
        style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Navigate</p>
            <h2 className="text-lg font-bold text-[var(--text)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title} menu`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-[var(--muted)] active:bg-[var(--surface-strong)] active:text-[var(--text)]"
          >
            ×
          </button>
        </div>

        <div className="grid gap-2">
          {items.map((item) => {
            if (!item.href) return null;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-left transition active:scale-[0.99] active:bg-accent-soft"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--text)]">{item.label}</span>
                  {item.description ? (
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{item.description}</span>
                  ) : null}
                </span>
                <NavIcon>
                  <path d="m9 18 6-6-6-6" />
                </NavIcon>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function getMobileMenuButton(): HTMLButtonElement | null {
  const button = document.getElementById('mobile-menu-button');
  return button instanceof HTMLButtonElement ? button : null;
}

export default function MobileAppNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);

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
    setActiveSection(null);
    const button = getMobileMenuButton();
    if (button?.getAttribute('aria-expanded') === 'true') {
      button.click();
    }
  }, [pathname]);

  useEffect(() => {
    if (!activeSection) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSection(null);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeSection]);

  const closeMoreMenu = () => {
    const button = getMobileMenuButton();
    if (button?.getAttribute('aria-expanded') === 'true') {
      button.click();
    }
  };

  const closeAllMenus = () => {
    setActiveSection(null);
    closeMoreMenu();
  };

  const toggleSection = (section: SectionKey) => {
    closeMoreMenu();
    setActiveSection((current) => (current === section ? null : section));
  };

  const toggleMoreMenu = () => {
    setActiveSection(null);
    getMobileMenuButton()?.click();
  };

  if (HIDDEN_PATHS.some((prefix) => pathMatches(pathname, prefix))) {
    return null;
  }

  const homeActive = pathname === '/';
  const leagueActive = LEAGUE_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const transactionsActive = TRANSACTION_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const draftActive = pathMatches(pathname, '/draft');
  const primaryActive = homeActive || leagueActive || transactionsActive || draftActive;
  const moreActive = menuOpen || (!primaryActive && !activeSection);

  return (
    <>
      {activeSection === 'league' ? (
        <SectionSheet
          section="league"
          title="League"
          items={LEAGUE_ITEMS}
          onClose={() => setActiveSection(null)}
        />
      ) : null}

      {activeSection === 'transactions' ? (
        <SectionSheet
          section="transactions"
          title="Transactions"
          items={TRANSACTION_ITEMS}
          onClose={() => setActiveSection(null)}
        />
      ) : null}

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
            onClick={closeAllMenus}
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

          <AppNavButton
            active={leagueActive || activeSection === 'league'}
            expanded={activeSection === 'league'}
            controls="mobile-league-menu"
            onClick={() => toggleSection('league')}
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
          </AppNavButton>

          <AppNavButton
            active={transactionsActive || activeSection === 'transactions'}
            expanded={activeSection === 'transactions'}
            controls="mobile-transactions-menu"
            onClick={() => toggleSection('transactions')}
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
          </AppNavButton>

          <AppNavItem
            href="/draft?view=next"
            active={draftActive}
            onClick={closeAllMenus}
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
            onClick={toggleMoreMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className={navItemClasses(moreActive)}
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
    </>
  );
}
