'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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

type SectionKey = 'league' | 'transactions' | 'more';

type MoreSheetProps = {
  authLoading: boolean;
  historyItems: UserNavItem[];
  isAdmin: boolean;
  mediaItems: UserNavItem[];
  onAdminLogout: () => void;
  onClose: () => void;
  onLogout: () => void;
  pathname: string;
  sessionTeam: string | null;
  suggestionsItem?: UserNavItem;
};

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
const HISTORY_ITEMS = USER_NAV_CONFIG.find((item) => item.id === 'history')?.children ?? [];
const MEDIA_ITEMS = USER_NAV_CONFIG.find((item) => item.id === 'media')?.children ?? [];
const SUGGESTIONS_ITEM = USER_NAV_CONFIG.find((item) => item.id === 'suggestions');

const LEAGUE_PATHS = LEAGUE_ITEMS.flatMap((item) => (item.href ? [item.href.split('?')[0]] : []));
const TRANSACTION_PATHS = TRANSACTION_ITEMS.flatMap((item) => (item.href ? [item.href.split('?')[0]] : []));
const MORE_PATHS = [
  ...HISTORY_ITEMS,
  ...MEDIA_ITEMS,
  ...(SUGGESTIONS_ITEM ? [SUGGESTIONS_ITEM] : []),
].flatMap((item) => (item.href ? [item.href.split('?')[0]] : []));

const ADMIN_ITEMS: UserNavItem[] = [
  { id: 'admin.newsletter', label: 'Newsletter Admin', href: '/admin/newsletter' },
  { id: 'admin.trades', label: 'Trades Admin', href: '/admin/trades' },
  { id: 'admin.suggestions', label: 'Suggestions Admin', href: '/admin/suggestions' },
  { id: 'admin.votes', label: 'Votes Admin', href: '/admin/votes' },
  { id: 'admin.taxi', label: 'Taxi Admin', href: '/admin/taxi' },
  { id: 'admin.users', label: 'Users Admin', href: '/admin/users' },
];

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

function SheetFrame({
  children,
  id,
  onClose,
  title,
}: {
  children: ReactNode;
  id: string;
  onClose: () => void;
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
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} navigation`}
        className="fixed left-3 right-3 z-[75] mx-auto max-h-[calc(100dvh-8.5rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl md:hidden"
        style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-1 pb-2">
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
        {children}
      </section>
    </>
  );
}

function MenuLink({ item, onClose }: { item: UserNavItem; onClose: () => void }) {
  if (!item.href) return null;

  return (
    <Link
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
}

function SectionSheet({
  items,
  onClose,
  section,
  title,
}: {
  items: UserNavItem[];
  onClose: () => void;
  section: Exclude<SectionKey, 'more'>;
  title: string;
}) {
  return (
    <SheetFrame id={`mobile-${section}-menu`} onClose={onClose} title={title}>
      <div className="grid gap-2 pt-3">
        {items.map((item) => (
          <MenuLink key={item.id} item={item} onClose={onClose} />
        ))}
      </div>
    </SheetFrame>
  );
}

function MoreGroup({
  items,
  label,
  onClose,
}: {
  items: UserNavItem[];
  label: string;
  onClose: () => void;
}) {
  return (
    <div>
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          if (!item.href) return null;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className="flex min-h-16 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-sm font-bold text-[var(--text)] transition active:scale-[0.99] active:bg-accent-soft"
            >
              <span>{item.label}</span>
              <NavIcon>
                <path d="m9 18 6-6-6-6" />
              </NavIcon>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MoreSheet({
  authLoading,
  historyItems,
  isAdmin,
  mediaItems,
  onAdminLogout,
  onClose,
  onLogout,
  pathname,
  sessionTeam,
  suggestionsItem,
}: MoreSheetProps) {
  return (
    <SheetFrame id="mobile-more-menu" onClose={onClose} title="More">
      <div className="space-y-5 pt-3">
        <MoreGroup label="History" items={historyItems} onClose={onClose} />
        <MoreGroup label="Media" items={mediaItems} onClose={onClose} />

        {suggestionsItem ? (
          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">League Input</h3>
            <MenuLink item={suggestionsItem} onClose={onClose} />
          </div>
        ) : null}

        {isAdmin ? (
          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Admin Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              {ADMIN_ITEMS.map((item) => (
                <MenuLink key={item.id} item={item} onClose={onClose} />
              ))}
            </div>
            <button
              type="button"
              onClick={onAdminLogout}
              className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--muted)] active:bg-[var(--surface-strong)]"
            >
              Admin Logout
            </button>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Account</h3>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            {authLoading ? (
              <p className="text-sm text-[var(--muted)]">Checking account…</p>
            ) : sessionTeam ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Signed in as</p>
                  <p className="mt-1 text-sm font-bold text-[var(--text)]">{sessionTeam}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/login?next=${encodeURIComponent(pathname)}`}
                    onClick={onClose}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-center text-sm font-semibold text-[var(--text)] active:bg-[var(--surface)]"
                  >
                    Switch Team
                  </Link>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)] active:bg-[var(--surface)]"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                onClick={onClose}
                className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 text-sm font-bold text-white"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </div>
    </SheetFrame>
  );
}

export default function MobileAppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [sessionTeam, setSessionTeam] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      setAuthLoading(true);
      try {
        const [authResponse, adminResponse] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store' }),
          fetch('/api/admin-login', { credentials: 'include', cache: 'no-store' }),
        ]);

        if (!mounted) return;

        if (authResponse.ok) {
          const authJson = await authResponse.json();
          setSessionTeam((authJson?.claims?.team as string) || null);
        } else {
          setSessionTeam(null);
        }

        if (adminResponse.ok) {
          const adminJson = await adminResponse.json();
          setIsAdmin(Boolean(adminJson?.isAdmin));
        } else {
          setIsAdmin(false);
        }
      } catch {
        if (mounted) {
          setSessionTeam(null);
          setIsAdmin(false);
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    setActiveSection(null);
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

  const closeAllMenus = () => {
    setActiveSection(null);
  };

  const toggleSection = (section: SectionKey) => {
    setActiveSection((current) => (current === section ? null : section));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionTeam(null);
      setActiveSection(null);
      router.refresh();
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin-login', { method: 'DELETE' });
    } finally {
      setIsAdmin(false);
      setActiveSection(null);
      router.refresh();
    }
  };

  if (HIDDEN_PATHS.some((prefix) => pathMatches(pathname, prefix))) {
    return null;
  }

  const homeActive = pathname === '/';
  const leagueActive = LEAGUE_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const transactionsActive = TRANSACTION_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const draftActive = pathMatches(pathname, '/draft');
  const moreRouteActive = MORE_PATHS.some((prefix) => pathMatches(pathname, prefix));
  const primaryActive = homeActive || leagueActive || transactionsActive || draftActive;
  const moreActive = activeSection === 'more' || moreRouteActive || (!primaryActive && activeSection === null);

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

      {activeSection === 'more' ? (
        <MoreSheet
          authLoading={authLoading}
          historyItems={HISTORY_ITEMS}
          isAdmin={isAdmin}
          mediaItems={MEDIA_ITEMS}
          onAdminLogout={handleAdminLogout}
          onClose={() => setActiveSection(null)}
          onLogout={handleLogout}
          pathname={pathname}
          sessionTeam={sessionTeam}
          suggestionsItem={SUGGESTIONS_ITEM}
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

          <AppNavButton
            active={moreActive}
            expanded={activeSection === 'more'}
            controls="mobile-more-menu"
            onClick={() => toggleSection('more')}
            icon={
              <NavIcon>
                <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
              </NavIcon>
            }
          >
            More
          </AppNavButton>
        </div>
      </nav>
    </>
  );
}
