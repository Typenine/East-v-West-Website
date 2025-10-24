'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import LinkButton from '@/components/ui/LinkButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Label from '@/components/ui/Label';
import Image from 'next/image';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

const navItems = [
  { name: 'Home', path: '/' },
  { name: 'Teams', path: '/teams' },
  { name: 'Standings', path: '/standings' },
  { name: 'Rules', path: '/rules' },
  { name: 'History', path: '/history' },
  { name: 'Draft', path: '/draft' },
  { name: 'Podcast', path: '/podcast' },
  { name: 'Newsletter', path: '/newsletter' },
  { name: 'Trades', path: '/trades' },
  { name: 'Transactions', path: '/transactions' },
  { name: 'Suggestions', path: '/suggestions' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const handleLogoClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    // On the homepage, clicking the logo opens Admin login instead of reloading
    if (pathname === '/') {
      e.preventDefault();
      setAdminOpen(true);
    }
  };

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
      router.push('/trades');
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
    const onDocClick = (e: MouseEvent) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setSessionTeam(null);
    router.push(pathname === '/login' ? '/' : pathname);
  };

  return (
    <>
    <nav className="evw-glass text-[var(--text)] border-b border-[var(--border)] sticky top-0 z-50 shadow-sm" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="font-bold text-xl" onClick={handleLogoClick}>
                East v. West
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-2">
                {navItems.map((item) => (
                  <LinkButton
                    key={item.name}
                    href={item.path}
                    aria-current={pathname === item.path ? 'page' : undefined}
                    variant={pathname === item.path ? 'secondary' : 'ghost'}
                    size="md"
                  >
                    {item.name}
                  </LinkButton>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-2">
              {sessionTeam ? (
                <div className="relative" ref={accountMenuRef}>
                  <button
                    aria-label="Account menu"
                    className="rounded-full overflow-hidden border border-[var(--border)] w-8 h-8"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    title={sessionTeam}
                    aria-expanded={accountMenuOpen}
                  >
                    <Image src={getTeamLogoPath(sessionTeam)} alt={sessionTeam} width={32} height={32} />
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 mt-2 w-40 evw-surface border border-[var(--border)] rounded shadow-lg p-1">
                      <button
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--surface-strong)]"
                        onClick={() => { setAccountMenuOpen(false); setChangeOpen(true); }}
                      >
                        Change PIN
                      </button>
                      <button
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--surface-strong)]"
                        onClick={() => { setAccountMenuOpen(false); handleLogout(); }}
                        disabled={authLoading}
                      >
                        Logout
                      </button>
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
        className={`${mobileMenuOpen ? 'block' : 'hidden'} md:hidden`}
        id="mobile-menu"
        role="menu"
        aria-labelledby="mobile-menu-button"
      >
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          {navItems.map((item) => (
            <LinkButton
              key={item.name}
              href={item.path}
              aria-current={pathname === item.path ? 'page' : undefined}
              variant={pathname === item.path ? 'secondary' : 'ghost'}
              size="lg"
              className="block text-left"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.name}
            </LinkButton>
          ))}
          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
            {sessionTeam ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Account menu"
                    className="rounded-full overflow-hidden border border-[var(--border)] w-8 h-8"
                    onClick={() => { setMobileMenuOpen(false); setChangeOpen(true); }}
                    title={sessionTeam}
                  >
                    <Image src={getTeamLogoPath(sessionTeam)} alt={sessionTeam} width={32} height={32} />
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => { setMobileMenuOpen(false); handleLogout(); }}>Logout</Button>
                </div>
              </>
            ) : (
              <LinkButton href={`/login?next=${encodeURIComponent(pathname)}`} variant="ghost" size="sm" className="w-full text-left" onClick={() => setMobileMenuOpen(false)}>
                Log In
              </LinkButton>
            )}
          </div>
        </div>
      </div>
    </nav>
    {/* Admin Login Modal */}
    <Modal open={adminOpen} onClose={() => setAdminOpen(false)} title="Admin Login" autoFocusPanel={false}>
      <form onSubmit={submitAdmin} noValidate className="space-y-3">
        <div>
          <Label htmlFor="admin-pin">Enter PIN</Label>
          <input
            id="admin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="PIN"
            autoFocus
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
        className="space-y-3"
      >
        <div>
          <Label htmlFor="cur-pin">Current PIN</Label>
          <input
            id="cur-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            name="current-pin"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="Current PIN"
            maxLength={12}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
          />
        </div>
        <div>
          <Label htmlFor="new-pin">New PIN</Label>
          <input
            id="new-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            name="new-pin"
            className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2"
            placeholder="New PIN (4–12 digits)"
            maxLength={12}
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
