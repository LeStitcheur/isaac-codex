/** Rendu du balisage interne (liens typés, marqueurs de version, listes). */
import { Fragment } from 'react';
import { Link } from 'react-router';
import { maskLabel, maskShort, tokenize } from '@isaac-codex/shared';
import { Tip } from './ui';
import { cn, entityHref } from '@/lib/utils';
import { useVersionBit } from '@/lib/queries';

function Line({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        if (t.type === 'text') return <Fragment key={i}>{t.text}</Fragment>;
        if (t.type === 'version')
          return (
            <Tip key={i} content={maskLabel(t.mask)}>
              <span className="mr-1 inline-block rounded border border-[#374250] bg-[#252e39] px-1 text-[10px] font-semibold leading-4 text-[#aab8c9] align-middle cursor-help">{maskShort(t.mask)}</span>
            </Tip>
          );
        return (
          <Link key={i} to={entityHref(t.kind, t.target)} className="text-parchment underline decoration-parchment/30 underline-offset-2 hover:decoration-parchment">
            {t.label}
          </Link>
        );
      })}
    </>
  );
}

/** Une ligne est « hors version » si elle commence par un marqueur ne contenant pas la version du profil. */
function lineMask(line: string): number | null {
  const m = line.match(/^[*#]*\s*⟨(\d+)⟩/);
  return m ? Number(m[1]) : null;
}

export function Markup({ text, className, inline }: { text: string | null | undefined; className?: string; inline?: boolean }) {
  const bit = useVersionBit();
  if (!text) return null;
  if (inline) return <span className={className}><Line text={text.replace(/\n+/g, ' ')} /></span>;
  const lines = text.split('\n');
  return (
    <div className={cn('markup space-y-1.5 leading-relaxed', className)}>
      {lines.map((line, i) => {
        const depth = line.match(/^([*#]+)/)?.[1]?.length ?? 0;
        const content = line.replace(/^[*#:]+\s*/, '');
        const mask = lineMask(line);
        const outOfVersion = mask !== null && (mask & bit) === 0;
        return (
          <div
            key={i}
            className={cn('flex gap-2', outOfVersion && 'opacity-45')}
            style={{ paddingLeft: depth > 1 ? `${(depth - 1) * 1.1}rem` : undefined }}
            title={outOfVersion ? `Ne concerne pas votre version de jeu (${maskLabel(mask!)})` : undefined}
          >
            {depth > 0 && <span className={cn('mt-[0.6em] size-1.5 shrink-0', depth > 1 ? 'bg-faint' : 'bg-blood')} aria-hidden />}
            <p className="min-w-0">
              <Line text={content} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
