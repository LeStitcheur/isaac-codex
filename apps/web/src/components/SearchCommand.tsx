/** Recherche universelle (Ctrl/⌘ + K ou « / »), tolérante aux fautes de frappe. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { cn, entityHref, KIND_LABEL } from '@/lib/utils';
import { Sprite } from './Sprite';
import { Kbd } from './ui';

interface SearchResult {
  kind: string;
  key: string;
  title: string;
  subtitle: string;
  nameEn: string;
  nameFr: string;
  extra: string;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useSearch(query: string, kinds?: string[], limit = 20) {
  const q = useDebounced(query.trim(), 120);
  return useQuery({
    queryKey: ['search', q, kinds?.join(','), limit],
    queryFn: ({ signal }) => api<{ results: SearchResult[] }>(`/api/search${qs({ q, limit, kinds })}`, { signal, auth: false }).then((r) => r.results),
    enabled: q.length >= 1,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { data, isFetching } = useSearch(query);
  const results = useMemo(() => (query.trim() ? data ?? [] : []), [data, query]);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = (r: SearchResult) => {
    onOpenChange(false);
    navigate(entityHref(r.kind, r.key));
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-abyss/80 backdrop-blur-sm" />
        <DialogPrimitive.Content className="panel fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden animate-rise focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Recherche universelle</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Rechercher un objet, un personnage, un boss, un succès ou un guide</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-parchment/10 px-4">
            <Search className="size-5 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter' && results[active]) {
                  go(results[active]!);
                }
              }}
              placeholder="Objet, personnage, boss, succès, guide… (ex. « brimstone », « 105 », « t23 »)"
              className="h-14 w-full bg-transparent text-lg text-ink placeholder:text-faint focus:outline-none"
              aria-label="Rechercher"
              data-testid="global-search-input"
            />
            {isFetching && <span className="size-2 animate-ping rounded-full bg-blood" />}
          </div>
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {query.trim() && results.length === 0 && !isFetching && <li className="p-6 text-center text-muted">Aucun résultat pour « {query} ».</li>}
            {!query.trim() && (
              <li className="p-6 text-center text-sm text-muted">
                Tapez quelques lettres. La recherche tolère les fautes de frappe et accepte les noms français et anglais ainsi que les identifiants.
              </li>
            )}
            {results.map((r, i) => (
              <li key={`${r.kind}:${r.key}`} role="option" aria-selected={i === active}>
                <button
                  className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', i === active ? 'bg-surface-3' : 'hover:bg-surface-2')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  data-testid="search-result"
                >
                  {['item', 'trinket', 'consumable', 'character', 'boss', 'floor'].includes(r.kind) ? (
                    <Sprite kind={r.kind as 'item'} id={r.key} size={32} />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-md bg-abyss font-display text-xs text-blood ring-1 ring-parchment/10">
                      {r.kind === 'achievement' ? '★' : r.kind === 'guide' ? '✎' : '◆'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.subtitle}
                      {r.nameFr && r.nameEn && r.nameFr !== r.nameEn ? ` · ${r.nameEn}` : ''}
                    </span>
                  </span>
                  <span className="hidden text-xs text-faint sm:inline">{KIND_LABEL[r.kind]}</span>
                  {i === active && <CornerDownLeft className="size-4 text-muted" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 border-t border-parchment/10 px-4 py-2 text-xs text-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> naviguer <Kbd>Entrée</Kbd> ouvrir <Kbd>Échap</Kbd> fermer
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
