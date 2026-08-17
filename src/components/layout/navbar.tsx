'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import LinkButton from '@/components/ui/LinkButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Label from '@/components/ui/Label';
import Image from 'next/image';
import HomeLeagueBanner from '@/components/layout/HomeLeagueBanner';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { USER_NAV_CONFIG, type UserNavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

// Teams allowed to see Draft Room link (must match middleware)
const DRAFT_ROOM_ALLOWED_TEAMS = ['Belleview Badgers', 'Mt. Lebanon Cake Eaters', 'Bimg Bamg Boomg'];
/** Grace period before closing a hover-opened menu (ms) */
const DESKTOP_MENU_CLOSE_DELAY_MS = 450;

function matchesPath(pathname: string, targetPath: string): boolean {
  if (targetPath === '/') return pathname === '/';
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function isHrefActive(pathname: string, searchParams: URLSearchParams, href?: string): boolean {
  if (!href) return false;
  const [targetPath, rawQuery = ''] = href.split('?');
  if (!matchesPath(pathname, targetPath)) return false;
  if (!rawQuery) return true;
  const targetParams = new URLSearchParams(rawQuery);
  for (const [key, value] of targetParams.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

function isNavItemActive(item: UserNavItem, pathname: string, searchParams: URLSearchParams): boolean {
  if (isHrefActive(pathname, searchParams, item.href)) return true;
  if (item.children && item.children.length > 0) {
    const pathLevelMatch = item.children.some((child) => {
      const childPath = child.href?.split('?')[0];
      return childPath ? matchesPath(pathname, childPath) : false;
    });
    if (pathLevelMatch) return true;
  }
  return (item.children || []).some((child) => isNavItemActive(child, pathname, searchParams));
}

function hrefSpecificity(href?: string): number {
  if (!href) return 0;
  const [path, query = ''] = href.split('?');
  return path.length + new URLSearchParams(query).size * 100;
}

function findBestActive(items: UserNavItem[], pathname: string, searchParams: URLSearchParams): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const item of items) {
    if (item.href && isHrefActive(pathname, searchParams, item.href)) {
      const candidate = { id: item.id, score: hrefSpecificity(item.href) };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (item.children && item.children.length > 0) {
      const childBest = findBestActive(item.children, pathname, searchParams);
      if (childBest && (!best || childBest.score > best.score)) best = childBest;
    }
  }
  return best;
}

const navTriggerClass = (active: boolean, open?: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
    active || open
      ? 'bg-[var(--surface-strong)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]'
      : 'text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]',
  );

const navLinkClass = (active: boolean) =>
  cn(
    'inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
    active
      ? 'bg-[var(--surface-strong)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]'
      : 'text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]',
  );

const dropdownPanelClass =
  'overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl';

const dropdownItemClass = (active: boolean, emphasize = false) =>
  cn(
    'block w-full rounded-lg px-3 py-2 text-left transition-colors',
    emphasize && !active && 'ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
    active
      ? 'bg-accent-soft font-semibold text-accent'
      : 'font-medium text-[var(--text)] hover:bg-[var(--surface-strong)]',
  );

type NavGroup = { label: string | null; items: UserNavItem[] };

function groupNavItems(items: UserNavItem[]): NavGroup[] {
  const order: Array<string | null> = [];
  const map = new Map<string | null, UserNavItem[]>();
  for (const item of items) {
    const key = item.group ?? null;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

function isChildBranchActive(
  child: UserNavItem,
  bestChild: { id: string; score: number } | null,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  if (bestChild?.id === child.id) return true;
  return (child.children || []).some((g) => isHrefActive(pathname, searchParams, g.href) || g.id === bestChild?.id);
}

function NavMenuSectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] first:pt-0">
      {children}
    </div>
  );
}

function NavMenuLeafLink({
  item,
  active,
  onNavigate,
  emphasize = false,
}: {
  item: UserNavItem;
  active: boolean;
  onNavigate?: () => void;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={item.href || '#'}
      role="menuitem"
      onClick={onNavigate}
      className={dropdownItemClass(active, emphasize)}
    >
      <span className={cn('text-sm leading-snug', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
      {item.description ? (
        <span className="mt-0.5 block text-xs leading-snug text-[var(--muted)]">{item.description}</span>
      ) : null}
    </Link>
  );
}

function NavMenuBranch({
  item,
  active,
  pathname,
  searchParams,
  onNavigate,
}: {
  item: UserNavItem;
  active: boolean;
  pathname: string;
  searchParams: URLSearchParams;
  onNavigate?: () => void;
}) {
  const bestGrand = findBestActive(item.children || [], pathname, searchParams);
  return (
    <div className="space-y-1">
      <NavMenuLeafLink item={item} active={active} onNavigate={onNavigate} />
      <ul className="ml-2 space-y-0.5 border-l-2 border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] pl-3">
        {(item.children || []).map((grand) => {
          const grandActive = bestGrand?.id === grand.id;
          return (
            <li key={grand.id}>
              <Link
                href={grand.href || '#'}
                role="menuitem"
                onClick={onNavigate}
                className={cn(
                  'block rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                  grandActive
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-[var(--text)] hover:bg-[var(--surface-strong)]',
                )}
              >
                {grand.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NavDropdownGroups({
  parentId,
  items,
  pathname,
  searchParams,
  onNavigate,
  layout = 'desktop',
}: {
  parentId: string;
  items: UserNavItem[];
  pathname: string;
  searchParams: URLSearchParams;
  onNavigate?: () => void;
  layout?: 'desktop' | 'mobile';
}) {
  const bestChild = findBestActive(items, pathname, searchParams);
  const groups = groupNavItems(items);
  const twoColumn = layout === 'desktop' && parentId === 'history' && groups.length > 1;

  return (
    <div className={cn(twoColumn ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'space-y-1')}>
      {groups.map((group) => (
        <div key={group.label || `${parentId}-ungrouped`}>
          {group.label ? <NavMenuSectionLabel>{group.label}</NavMenuSectionLabel> : null}
          <div className="space-y-0.5">
            {group.items.map((child) => {
              const branchActive = isChildBranchActive(child, bestChild, pathname, searchParams);
              const hasGrandChildren = Boolean(child.children && child.children.length > 0);
              const emphasize = child.id === 'draft.room';

              if (hasGrandChildren) {
                return (
                  <NavMenuBranch
                    key={child.id}
                    item={child}
                    active={branchActive}
                    pathname={pathname}
                    searchParams={searchParams}
                    onNavigate={onNavigate}
                  />
                );
              }

              return (
                <NavMenuLeafLink
                  key={child.id}
                  item={child}
                  active={branchActive}
                  onNavigate={onNavigate}
                  emphasize={emphasize}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChevronDownIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180', className)}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentQuery = useMemo(() => new URLSearchParams(searchParams?.toString() || ''), [searchParams]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({});
  const [adminOpen, setAdminOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [sessionTeam, setSessionTeam] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState<string | null>(null);
  const [desktopMenuPinned, setDesktopMenuPinned] = useState<string | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const adminPinRef = useRef<HTMLInputElement | null>(null);
  const currentPinRef = useRef<HTMLInputElement | null>(null);
  const newPinRef = useRef<HTMLInputElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Filter nav config to hide Draft Room for users without access
  const filteredNavConfig = useMemo(() => {
    const canSeeDraftRoom = isAdmin || (sessionTeam && DRAFT_ROOM_ALLOWED_TEAMS.includes(sessionTeam));
    if (canSeeDraftRoom) return USER_NAV_CONFIG;
    // Filter out draft.room from the draft children
    return USER_NAV_CONFIG.map(item => {
      if (item.id === 'draft' && item.children) {
        return { ...item, children: item.children.filter(child => child.id !== 'draft.room') };
      }
      return item;
    });
  }, [isAdmin, sessionTeam]);

  const toggleMobileSection = (id: string) => {
    setMobileExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const closeMobile = () => {
    setMobileMenuOpen(false);
  };

  const cancelDesktopMenuClose = useCallback(() => {
    if (desktopMenuCloseTimerRef.current) {
      clearTimeout(desktopMenuCloseTimerRef.current);
      desktopMenuCloseTimerRef.current = null;
    }
  }, []);

  const closeDesktopMenu = useCallback(() => {
    cancelDesktopMenuClose();
    setDesktopMenuOpen(null);
    setDesktopMenuPinned(null);
  }, [cancelDesktopMenuClose]);

  const openDesktopMenu = useCallback((id: string) => {
    cancelDesktopMenuClose();
    setDesktopMenuOpen(id);
  }, [cancelDesktopMenuClose]);

  const scheduleCloseDesktopMenu = useCallback((id: string) => {
    if (desktopMenuPinned === id) return;
    cancelDesktopMenuClose();
    desktopMenuCloseTimerRef.current = setTimeout(() => {
      setDesktopMenuOpen((open) => (open === id ? null : open));
      desktopMenuCloseTimerRef.current = null;
    }, DESKTOP_MENU_CLOSE_DELAY_MS);
  }, [desktopMenuPinned, cancelDesktopMenuClose]);

  const toggleDesktopMenu = useCallback((id: string) => {
    if (desktopMenuOpen === id && desktopMenuPinned === id) {
      closeDesktopMenu();
      return;
    }
    setDesktopMenuPinned(id);
    openDesktopMenu(id);
  }, [desktopMenuOpen, desktopMenuPinned, closeDesktopMenu, openDesktopMenu]);

  const goHome = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    closeDesktopMenu();
    setMobileMenuOpen(false);
    if (pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Off home: let the native href="/" navigate — do not preventDefault or router.push.
  }, [pathname, closeDesktopMenu]);

  useEffect(() => () => cancelDesktopMenuClose(), [cancelDesktopMenuClose]);

  // Removed special homepage click-to-admin; admin sign-in now lives on /login

  const submitAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: pin.trim() }),
      });
      if (!r.ok) throw new Error('Invalid PIN');
      setAdminOpen(false);
      setPin('');
      // Stay on current page; admin mode enabled via cookie
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setAuthLoading(true);
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!mounted) return;
        if (r.ok) {
          const j = await r.json();
          setSessionTeam((j?.claims?.team as string) || null);
        } else {
          setSessionTeam(null);
        }
      } catch {
        if (mounted) setSessionTeam(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/admin-login', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (mounted) setIsAdmin(Boolean(j?.isAdmin)); })
      .catch(() => { if (mounted) setIsAdmin(false); });
    return () => { mounted = false; };
  }, [pathname]);

  useEffect(() => {
    if (!adminOpen) return;
    const id = requestAnimationFrame(() => adminPinRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [adminOpen]);

  // Apply team-themed colors (gradient/buttons) when signed in
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (sessionTeam) {
        const colors = getTeamColors(sessionTeam);
        // Map brand tokens to team colors
        root.style.setProperty('--danger', colors.primary);
        root.style.setProperty('--gold', colors.secondary || colors.primary);
      } else {
        // Revert to league defaults defined in globals.css
        root.style.removeProperty('--danger');
        root.style.removeProperty('--gold');
      }
    } catch {}
  }, [sessionTeam]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest('[data-nav-home]')) {
        return;
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(target)) {
        closeDesktopMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDesktopMenu();
        setAccountMenuOpen(false);
      }
    };
    // Use click (not mousedown) so link navigation isn't cancelled by a re-render mid-click.
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeDesktopMenu]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setSessionTeam(null);
    router.push(pathname === '/login' ? '/' : pathname);
  };

  const handleAdminLogout = async () => {
    try { await fetch('/api/admin-login', { method: 'DELETE' }); } catch {}
    setIsAdmin(false);
    // keep user on page
  };

  return (
    <>
    {pathname === '/' ? <HomeLeagueBanner /> : null}
    <nav className="evw-surface sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 items-center gap-8">
            <div className="relative z-[60] shrink-0">
              <Link
                href="/"
                data-nav-home
                onClick={goHome}
                className="text-lg font-bold tracking-tight text-[var(--text)] transition-colors hover:text-accent sm:text-xl"
              >
                East v. West
              </Link>
            </div>
            <div className="hidden md:block">
              <div
                className="flex items-center gap-0.5"
                ref={desktopMenuRef}
                onMouseEnter={cancelDesktopMenuClose}
                onMouseLeave={() => {
                  if (desktopMenuOpen) scheduleCloseDesktopMenu(desktopMenuOpen);
                }}
              >
                {filteredNavConfig.map((item) => {
                  const itemActive = isNavItemActive(item, pathname, currentQuery);
                  const hasChildren = Boolean(item.children && item.children.length > 0);
                  const menuOpen = desktopMenuOpen === item.id;
                  const isSuggestions = item.id === 'suggestions';

                  if (!hasChildren && item.href) {
                    if (item.id === 'home') {
                      return (
                        <Link
                          key={item.id}
                          href="/"
                          data-nav-home
                          aria-current={isHrefActive(pathname, currentQuery, item.href) ? 'page' : undefined}
                          className={navLinkClass(itemActive)}
                          onClick={goHome}
                        >
                          {item.label}
                        </Link>
                      );
                    }
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isHrefActive(pathname, currentQuery, item.href) ? 'page' : undefined}
                        className={cn(
                          navLinkClass(itemActive),
                          isSuggestions && !itemActive && 'text-accent hover:text-accent',
                        )}
                        onClick={() => closeDesktopMenu()}
                      >
                        {item.label}
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="relative"
                      onMouseEnter={() => openDesktopMenu(item.id)}
                      onMouseLeave={() => scheduleCloseDesktopMenu(item.id)}
                    >
                      <button
                        type="button"
                        className={navTriggerClass(itemActive, menuOpen)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={`desktop-menu-${item.id}`}
                        onClick={() => toggleDesktopMenu(item.id)}
                        onFocus={() => openDesktopMenu(item.id)}
                      >
                        {item.label}
                        <ChevronDownIcon open={menuOpen} />
                      </button>

                      {/* pt-3 bridges the gap between trigger and panel so hover is not lost */}
                      {menuOpen ? (
                        <div
                          id={`desktop-menu-${item.id}`}
                          className="absolute left-0 top-full z-50 min-w-full pt-3"
                          onMouseEnter={() => openDesktopMenu(item.id)}
                        >
                          <div
                            className={cn(
                              dropdownPanelClass,
                              item.id === 'history' ? 'w-[22rem]' : item.id === 'draft' ? 'w-[16.5rem]' : 'w-[14.5rem]',
                            )}
                            role="menu"
                          >
                            <NavDropdownGroups
                              parentId={item.id}
                              items={item.children || []}
                              pathname={pathname}
                              searchParams={currentQuery}
                              onNavigate={closeDesktopMenu}
                              layout="desktop"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-2">
              {sessionTeam || isAdmin ? (
                <div className="relative" ref={accountMenuRef}>
                  <button
                    aria-label="Account menu"
                    className="rounded-full overflow-hidden border border-[var(--border)] w-8 h-8"
                    style={sessionTeam ? { borderColor: getTeamColors(sessionTeam).secondary, borderWidth: 2 } : undefined}
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    title={sessionTeam || (isAdmin ? 'Admin' : '')}
                    aria-expanded={accountMenuOpen}
                  >
                    {sessionTeam ? (
                      <Image src={getTeamLogoPath(sessionTeam)} alt={sessionTeam} width={32} height={32} />
                    ) : (
                      <Image src="/assets/teams/East v West Logos/Official East v. West Logo.png" alt="Admin" width={32} height={32} />
                    )}
                  </button>
                  {accountMenuOpen && (
                    <div className={cn(dropdownPanelClass, 'absolute right-0 mt-2 w-48')}>
                      {isAdmin && (
                        <>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/newsletter'); }}
                          >
                            Admin: Newsletter
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/trades'); }}
                          >
                            Admin: Trades
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/suggestions'); }}
                          >
                            Admin: Suggestions
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/votes'); }}
                          >
                            Admin: Votes
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/taxi'); }}
                          >
                            Admin: Taxi
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); router.push('/admin/users'); }}
                          >
                            Admin: Users
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); handleAdminLogout(); }}
                          >
                            Admin Logout
                          </button>
                          <div className="my-1 border-t border-[var(--border)]" />
                        </>
                      )}
                      {sessionTeam && (
                        <>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); setChangeOpen(true); }}
                          >
                            Change PIN
                          </button>
                          <button
                            className={dropdownItemClass(false)}
                            onClick={() => { setAccountMenuOpen(false); handleLogout(); }}
                            disabled={authLoading}
                          >
                            Logout
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <LinkButton href={`/login?next=${encodeURIComponent(pathname)}`} variant="ghost" size="sm">Log In</LinkButton>
              )}
            </div>
            <div className="md:hidden">
              <Button
                id="mobile-menu-button"
                type="button"
                variant="ghost"
                size="sm"
                aria-controls="mobile-menu"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle main menu"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {/* Icon when menu is closed */}
                <svg
                  className={`${mobileMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      <div
        className={cn('relative z-40 border-t border-[var(--border)] md:hidden', mobileMenuOpen ? 'block' : 'hidden')}
        id="mobile-menu"
        aria-labelledby="mobile-menu-button"
      >
        <div className="space-y-2 px-3 py-3">
          <div className="pb-3 mb-1 border-b border-[var(--border)]">
            {sessionTeam || isAdmin ? (
              <div className="flex items-center gap-3">
                <button
                  aria-label="Account menu"
                  className="rounded-full overflow-hidden border border-[var(--border)] w-10 h-10 shrink-0"
                  style={sessionTeam ? { borderColor: getTeamColors(sessionTeam).secondary, borderWidth: 2 } : undefined}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (sessionTeam) setChangeOpen(true);
                  }}
                  title={sessionTeam || (isAdmin ? 'Admin' : '')}
                >
                  {sessionTeam ? (
                    <Image src={getTeamLogoPath(sessionTeam)} alt={sessionTeam} width={40} height={40} />
                  ) : (
                    <Image src="/assets/teams/East v West Logos/Official East v. West Logo.png" alt="Admin" width={40} height={40} />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">
                    {sessionTeam || (isAdmin ? 'Admin' : 'Account')}
                  </p>
                  {sessionTeam ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline-offset-2 hover:underline"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setChangeOpen(true);
                      }}
                    >
                      Change PIN
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {sessionTeam ? (
                    <Button size="sm" variant="ghost" onClick={() => { setMobileMenuOpen(false); handleLogout(); }}>Logout</Button>
                  ) : null}
                  {isAdmin ? (
                    <Button size="sm" variant="ghost" onClick={() => { setMobileMenuOpen(false); handleAdminLogout(); }}>Admin Logout</Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <LinkButton
                href={`/login?next=${encodeURIComponent(pathname)}`}
                variant="primary"
                size="lg"
                fullWidth
                className="min-h-[48px] justify-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Log In
              </LinkButton>
            )}
          </div>

          {filteredNavConfig.map((item) => {
            const itemActive = isNavItemActive(item, pathname, currentQuery);
            const hasChildren = Boolean(item.children && item.children.length > 0);
            const isSuggestions = item.id === 'suggestions';

            if (!hasChildren && item.href) {
              if (item.id === 'home') {
                return (
                  <Link
                    key={item.id}
                    href="/"
                    data-nav-home
                    aria-current={isHrefActive(pathname, currentQuery, item.href) ? 'page' : undefined}
                    className={cn(navLinkClass(itemActive), 'block w-full text-left')}
                    onClick={goHome}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isHrefActive(pathname, currentQuery, item.href) ? 'page' : undefined}
                  className={cn(
                    navLinkClass(itemActive),
                    'block w-full text-left',
                    isSuggestions && !itemActive && 'text-accent hover:text-accent',
                  )}
                  onClick={closeMobile}
                >
                  {item.label}
                </Link>
              );
            }

            const expanded = Boolean(mobileExpanded[item.id]);
            return (
              <div key={item.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]/40">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition-colors',
                    itemActive ? 'text-[var(--text)]' : 'text-[var(--muted)]',
                  )}
                  onClick={() => toggleMobileSection(item.id)}
                  aria-expanded={expanded}
                >
                  <span>{item.label}</span>
                  <ChevronDownIcon open={expanded} />
                </button>

                {expanded && (
                  <div className="border-t border-[var(--border)] px-2 py-2">
                    <NavDropdownGroups
                      parentId={item.id}
                      items={item.children || []}
                      pathname={pathname}
                      searchParams={currentQuery}
                      onNavigate={closeMobile}
                      layout="mobile"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
    {/* Admin Login Modal */}
    <Modal open={adminOpen} onClose={() => setAdminOpen(false)} title="Admin Login" autoFocusPanel={false}>
      <form onSubmit={submitAdmin} noValidate className="space-y-3">
        <div>
          <Label htmlFor="admin-pin">Enter PIN</Label>
          <input
            ref={adminPinRef}
            id="admin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="PIN"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          />
        </div>
        {adminError && <div className="text-red-500 text-sm">{adminError}</div>}
        <div className="flex items-center gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={() => setAdminOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={adminLoading || !pin}>Enter Admin</Button>
        </div>
      </form>
    </Modal>

    {/* Change PIN Modal */}
    <Modal open={changeOpen} onClose={() => setChangeOpen(false)} title="Change PIN" autoFocusPanel={false}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setChangeMsg(null);
          setChangeLoading(true);
          try {
            const r = await fetch('/api/auth/change-pin', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ currentPin, newPin }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j?.error || 'Failed to change PIN');
            }
            setChangeMsg('PIN updated. Please sign in again.');
          } catch (err) {
            setChangeMsg(err instanceof Error ? err.message : 'Failed to change PIN');
          } finally {
            setChangeLoading(false);
          }
        }}
        noValidate
        autoComplete="off"
        className="space-y-3"
      >
        <div>
          <Label htmlFor="cur-pin">Current PIN</Label>
          <input
            id="cur-pin"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            name="current-pin"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            pattern="[0-9]*"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="Current PIN"
            maxLength={12}
            ref={currentPinRef}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
          />
        </div>
        <div>
          <Label htmlFor="new-pin">New PIN</Label>
          <input
            id="new-pin"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            name="new-pin"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            pattern="[0-9]*"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="New PIN (4–12 digits)"
            maxLength={12}
            ref={newPinRef}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
          />
        </div>
        {changeMsg && <div className="text-sm" role="status">{changeMsg}</div>}
        <div className="flex items-center gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={() => setChangeOpen(false)}>Close</Button>
          <Button type="submit" disabled={changeLoading || !currentPin || !newPin}>Update PIN</Button>
        </div>
      </form>
    </Modal>
    </>
  );
}
