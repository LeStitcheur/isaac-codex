import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, ChevronRight, Coins, Compass, Download, FlaskConical, Gem, Home, Info, Map as MapIcon, Menu, PanelLeftClose, PanelLeftOpen, Search, Skull,
  Sparkles, Target, Trophy, UserRound, Users, X,
} from 'lucide-react';
import { PLATFORMS, VERSIONS } from '@isaac-codex/shared';
import { useActiveProfile, useProfileStore } from '@/lib/profile-store';
import { usePwaInstall } from '@/lib/pwa';
import { AuthScreen } from './AuthScreen';
import { useMeta, usePatchProgress, useProgress } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/game-assets';
import { SearchCommand } from './SearchCommand';
import { Button, Kbd, Select, Tip } from './ui';

const NAV: { title: string; items: { to: string; label: string; icon: ReactNode; end?: boolean }[] }[] = [
  { title: 'Codex', items: [{ to: '/', label: 'Vue d’ensemble', icon: <Home />, end: true }] },
  {
    title: 'Encyclopédie',
    items: [
      { to: '/personnages', label: 'Personnages', icon: <Users /> },
      { to: '/objets', label: 'Objets', icon: <Gem /> },
      { to: '/synergies', label: 'Synergies', icon: <Sparkles /> },
      { to: '/simulateur', label: 'Simulateur de build', icon: <FlaskConical /> },
      { to: '/boss', label: 'Boss', icon: <Skull /> },
      { to: '/etages', label: 'Étages & routes', icon: <MapIcon /> },
    ],
  },
  {
    title: 'Progression',
    items: [
      { to: '/succes', label: 'Suivi des déblocages', icon: <Trophy /> },
      { to: '/planificateur', label: 'Que débloquer ensuite ?', icon: <Target /> },
      { to: '/dons', label: 'Machines de dons', icon: <Coins /> },
    ],
  },
  {
    title: 'Savoir',
    items: [
      { to: '/guides', label: 'Guides', icon: <BookOpen /> },
      { to: '/profil', label: 'Profil & sauvegardes', icon: <UserRound /> },
      { to: '/a-propos', label: 'Sources & à propos', icon: <Info /> },
    ],
  },
];

/** Rubrique courante, pour le fil d'Ariane. */
function currentSection(pathname: string) {
  const items = NAV.flatMap((g) => g.items);
  return items.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to))) ?? items[0]!;
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      <span className="grid h-10 w-[38px] shrink-0 place-items-center rounded-xl border border-[#ff758666] bg-gradient-to-br from-[#ff5266] to-[#b31432] shadow-[0_6px_25px_#ed21401a]">
        <img src={asset('characters', 'isaac') ?? '/favicon.svg'} alt="" className="size-6 [image-rendering:pixelated] drop-shadow-[1px_1px_0_rgb(0_0_0/0.35)]" />
      </span>
      {!collapsed && (
        <span className="leading-none">
          <span className="brand-font block text-[22px] text-white">ISAAC CODEX</span>
          <span className="mt-1.5 block text-[7px] font-medium tracking-[0.25em] text-[#75808f]">WIKI NON OFFICIEL</span>
        </span>
      )}
    </Link>
  );
}

/**
 * Ouverture/fermeture du menu mobile au doigt : glisser de gauche à droite l'ouvre, de droite à gauche le ferme.
 * Ignoré dans les zones à défilement horizontal (carrousels, tableaux) et pour les gestes surtout verticaux.
 */
function useSwipeMenu(open: boolean, setOpen: (v: boolean) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const scrollsX = (el: EventTarget | null): boolean => {
      if (!(el instanceof Element)) return false;
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        if (n instanceof HTMLElement && n.dataset.noSwipe !== undefined) return true;
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || window.innerWidth >= 768) return;
      start.current = scrollsX(e.target) ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!s || !t || Date.now() - s.t > 600) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx > 0 && !open) setOpen(true);
      else if (dx < 0 && open) setOpen(false);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [open, setOpen]);
}

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6 px-3.5 pb-4" aria-label="Navigation principale">
      {NAV.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-[5px]">
          {!collapsed && <div className="mx-3 mb-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#596675]">{group.title}</div>}
          {group.items.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-3 rounded-[9px] border border-transparent px-[13px] py-[11px] text-xs font-medium text-muted transition-colors hover:bg-[#191f26] hover:text-[#f6f7f9] [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.7] [&_svg]:text-[#687587]',
                    isActive &&
                      'border-[#ff415729] bg-gradient-to-r from-[#ff41571c] to-[#ff41570b] text-[#ff7384] before:absolute before:-left-[15px] before:top-3 before:bottom-3 before:w-0.5 before:bg-[#ff5268] hover:bg-[#ff415722] hover:text-[#ff7384] [&_svg]:text-[#ff677a]',
                    collapsed && 'justify-center px-0 before:hidden',
                  )
                }
              >
                {item.icon}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
            return collapsed ? (
              <Tip key={item.to} content={item.label}>
                {link}
              </Tip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ProfileQuickSettings() {
  const profile = useActiveProfile();
  const profiles = useProfileStore((s) => s.profiles);
  const setActive = useProfileStore((s) => s.setActive);
  const setAuthOpen = useProfileStore((s) => s.setAuthOpen);
  const { data: progress } = useProgress();
  const patch = usePatchProgress();
  const qc = useQueryClient();
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Version du jeu"
        className="hidden h-9 w-auto text-xs md:block"
        value={progress?.settings.gameVersion ?? 'repentance'}
        disabled={!progress}
        onChange={(e) => patch.mutate({ settings: { gameVersion: e.target.value } }, { onSuccess: () => void qc.invalidateQueries({ queryKey: ['recommendations'] }) })}
      >
        {VERSIONS.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Plateforme"
        className="hidden h-9 w-auto text-xs lg:block"
        value={progress?.settings.platform ?? 'switch'}
        disabled={!progress}
        onChange={(e) => patch.mutate({ settings: { platform: e.target.value } })}
      >
        {PLATFORMS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </Select>
      {profiles.length > 1 ? (
        <Select
          aria-label="Compte actif"
          className="h-9 w-auto max-w-40 text-xs"
          value={profile?.id ?? ''}
          onChange={(e) => (e.target.value === '__add' ? setAuthOpen(true) : setActive(e.target.value))}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__add">＋ Ajouter un compte…</option>
        </Select>
      ) : (
        <NavLink to="/profil" title={profile?.name} aria-label={`Profil ${profile?.name ?? ''}`} className="grid size-[33px] shrink-0 place-items-center rounded-full border border-[#5f2a38] bg-[#2f1922] text-[13px] font-semibold uppercase text-[#ff7187] hover:border-[#ff7187]">
          {profile?.name?.[0] ?? <UserRound className="size-4" />}
        </NavLink>
      )}
    </div>
  );
}

/** Proposé uniquement quand le navigateur permet l'installation (Android/Chrome, non encore installée). */
function InstallButton({ className }: { className?: string }) {
  const { install } = usePwaInstall();
  if (!install) return null;
  return (
    <Button variant="outline" size="sm" className={className} onClick={() => void install()}>
      <Download /> Installer l'application
    </Button>
  );
}

export function AppShell() {
  const profile = useActiveProfile();
  const authOpen = useProfileStore((s) => s.authOpen);
  const setAuthOpen = useProfileStore((s) => s.setAuthOpen);
  // Plus de session invité : sans compte actif, seul l'écran de connexion est accessible.
  if (!profile) return <AuthScreen />;
  if (authOpen) return <AuthScreen onCancel={() => setAuthOpen(false)} />;
  return <Shell />;
}

function Shell() {
  const collapsed = useProfileStore((s) => s.sidebarCollapsed);
  const toggle = useProfileStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const meta = useMeta();
  const profile = useActiveProfile();
  const { data: progress } = useProgress();
  const section = currentSection(location.pathname);
  useSwipeMenu(mobileOpen, setMobileOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[#20252c] bg-abyss md:flex',
          collapsed ? 'w-[72px]' : 'w-[224px]',
        )}
      >
        <div className={cn('px-6 pb-8 pt-[26px]', collapsed && 'px-0')}>
          <Brand collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar collapsed={collapsed} />
        </div>
        <div className="space-y-3 px-3.5 pb-3.5 pt-5">
          {!collapsed && <InstallButton className="w-full" />}
          {!collapsed && (
            <NavLink to="/profil" className="flex items-center gap-2.5 rounded-[10px] border border-[#29313b] bg-[#141a21] px-[11px] py-[13px] hover:border-[#3d4856]">
              <span className="relative text-[#a1b0c3]">
                <UserRound className="size-5" />
                <i className={cn('absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full border border-[#141a21]', progress ? 'bg-ok' : 'bg-blood')} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[11px] font-semibold">{profile?.name}</strong>
                <span className="block truncate text-[9px] text-[#6d7d8d]">{VERSIONS.find((v) => v.key === progress?.settings.gameVersion)?.label ?? 'Repentance'}</span>
              </span>
              <ChevronRight className="ml-auto size-4 text-[#596675]" />
            </NavLink>
          )}
          <button onClick={toggle} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[#556271] hover:text-ink', collapsed && 'justify-center')} aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Replier le menu</>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-[#20252c] bg-abyss animate-rise">
            <div className="flex items-center justify-between px-6 pb-7 pt-6">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu">
                <X />
              </Button>
            </div>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <InstallButton className="mx-3.5 mb-6 w-[calc(100%-1.75rem)]" />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#1f252d] bg-[#0d101499] px-3 backdrop-blur-[15px] sm:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Menu />
          </Button>
          <nav aria-label="Fil d'Ariane" className="hidden items-center gap-3 whitespace-nowrap text-[11px] text-[#6e7b8b] lg:flex">
            <Link to="/" className="hover:text-ink">Isaac Codex</Link>
            <ChevronRight className="size-3.5 text-[#46525f]" />
            <strong className="font-medium text-[#cdd4df]">{section.label}</strong>
          </nav>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-[#272f39] bg-[#141920] px-3 text-left text-[11px] text-[#8996a7] transition-colors hover:border-[#3d4856] sm:max-w-72"
              data-testid="open-search"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">Rechercher…</span>
              <span className="ml-auto hidden items-center gap-1 sm:flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <span className="hidden h-6 w-px bg-[#26303a] sm:block" />
            <ProfileQuickSettings />
          </div>
        </header>

        {progress && !progress.hasPassword && (
          <div className="border-b border-blood/30 bg-blood/10 px-4 py-2 text-xs text-ink sm:px-8">
            Ce compte n'a pas encore de mot de passe : sans lui, impossible de vous reconnecter.{' '}
            <NavLink to="/profil" className="font-semibold underline">Définir un mot de passe</NavLink>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1720px] flex-1 px-4 py-7 sm:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-[#1f252d] px-8 py-5 text-center text-[11px] text-faint">
          <p>
            Isaac Codex — wiki communautaire <strong>non officiel</strong>, sans affiliation avec Edmund McMillen, Nicalis ou les détenteurs des droits de The Binding of Isaac.
          </p>
          <p className="mt-1">
            Données de jeu : <a className="underline" href="https://bindingofisaacrebirth.wiki.gg/" target="_blank" rel="noreferrer noopener">The Binding of Isaac: Rebirth Wiki</a> (CC BY-SA 4.0)
            {meta.data && <> · jeu de données {meta.data.meta.datasetVersion}</>} · <Compass className="inline size-3" /> <NavLink to="/a-propos" className="underline">sources et licences</NavLink>
          </p>
        </footer>
      </div>
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
