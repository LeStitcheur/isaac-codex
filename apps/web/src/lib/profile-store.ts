/**
 * Profils connus de ce navigateur. Seuls l'identifiant, le nom et le jeton d'accès sont conservés localement ;
 * la progression elle-même est stockée côté serveur.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LocalProfile {
  id: string;
  name: string;
  token: string;
}

interface ProfileState {
  profiles: LocalProfile[];
  activeId: string | null;
  sidebarCollapsed: boolean;
  add: (p: LocalProfile, activate?: boolean) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  setActive: (id: string) => void;
  /** Retire le compte de cet appareil et revient à l'écran de connexion. */
  logout: (id: string) => void;
  /** Écran de connexion ouvert par-dessus l'application (ajout d'un autre compte). Non persisté. */
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profiles: [],
      activeId: null,
      sidebarCollapsed: false,
      add: (p, activate = true) =>
        set((s) => ({ profiles: [...s.profiles.filter((x) => x.id !== p.id), p], activeId: activate ? p.id : s.activeId ?? p.id, authOpen: false })),
      remove: (id) =>
        set((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id);
          return { profiles, activeId: s.activeId === id ? profiles[0]?.id ?? null : s.activeId };
        }),
      rename: (id, name) => set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })),
      setActive: (id) => set({ activeId: id, authOpen: false }),
      logout: (id) => set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id), activeId: null })),
      authOpen: false,
      setAuthOpen: (open) => set({ authOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'isaac-codex-profiles',
      version: 1,
      partialize: (s) => ({ profiles: s.profiles, activeId: s.activeId, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);

export function getActiveProfile(): LocalProfile | null {
  const s = useProfileStore.getState();
  return s.profiles.find((p) => p.id === s.activeId) ?? null;
}

export function useActiveProfile(): LocalProfile | null {
  return useProfileStore((s) => s.profiles.find((p) => p.id === s.activeId) ?? null);
}
