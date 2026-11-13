/**
 * Installation de l'application (Android/Chrome) : l'invite native `beforeinstallprompt` est capturée
 * dès le chargement, puis déclenchée par le bouton « Installer l'application ».
 */
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** `install` est null tant que le navigateur ne propose pas l'installation (déjà installée, navigateur non compatible…). */
export function usePwaInstall(): { install: (() => Promise<void>) | null } {
  const available = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  return {
    install: available
      ? async () => {
          const e = deferred;
          if (!e) return;
          await e.prompt();
          await e.userChoice;
          deferred = null;
          emit();
        }
      : null,
  };
}
