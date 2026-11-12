import { describe, expect, it } from 'vitest';
import { dlcMask, infoboxParam, wikiToMarkup } from '../../scripts/data/lib/wikitext';
import { filterMarkupByVersion, markupToText, slugify, tokenize, maskLabel, maskShort } from '@isaac-codex/shared';

describe('conversion wikitext', () => {
  it('convertit les modèles de liens et de version', () => {
    const out = wikiToMarkup('* {{dlc|r}} Use {{i|The D6}} with {{t|Missing Poster|text=the poster}}.');
    expect(out).toBe('* ⟨24⟩ Use ⟦i:The D6⟧ with ⟦t:Missing Poster¦the poster⟧.');
  });

  it('convertit les chaînes Cargo rendues (infobulles et indicateurs de version)', () => {
    const rendered =
      '[[File:Dlc r indicator.png|link=|class=dlc cf-tag cf-val-24 |alt=x|Added]] Die holding <span class="tooltip" data-tooltip="t%2Ftooltip%7CMissing+Poster" data-tooltip-dlc="31"><span>[[File:x.png]]</span>[[:Missing Poster|Missing Poster]]</span>';
    expect(wikiToMarkup(rendered)).toBe('⟨24⟩ Die holding ⟦t:Missing Poster⟧');
  });

  it('supprime fichiers, catégories, références et commentaires', () => {
    expect(wikiToMarkup("'''Gras''' [[File:a.png|20px]][[Category:X]]<ref>note</ref><!-- c --> [[Page|Lien]]")).toBe('Gras Lien');
  });

  it('respecte la table officielle des codes de version', () => {
    expect(dlcMask('r')).toBe(24);
    expect(dlcMask('nr')).toBe(7);
    expect(dlcMask('a+')).toBe(28);
    expect(dlcMask('r+')).toBe(16);
    expect(dlcMask('inconnu')).toBeNull();
  });

  it("lit un paramètre d'infobox", () => {
    expect(infoboxParam('{{infobox boss\n | id = 45\n | base hp     = 645\n | pool = x\n}}', 'base hp')).toBe('645');
  });
});

describe('balisage partagé', () => {
  it('tokenise liens et versions', () => {
    const t = tokenize('⟨24⟩ Voir ⟦i:105¦The D6⟧.');
    expect(t).toEqual([
      { type: 'version', mask: 24 },
      { type: 'text', text: ' Voir ' },
      { type: 'link', kind: 'i', target: '105', label: 'The D6' },
      { type: 'text', text: '.' },
    ]);
  });
  it('produit un texte brut', () => expect(markupToText('* ⟨24⟩ ⟦i:105¦The D6⟧ relance')).toBe('The D6 relance'));
  it('filtre les lignes par version', () => {
    const s = '* commun\n* ⟨7⟩ ancien\n* ⟨24⟩ repentance';
    expect(filterMarkupByVersion(s, 8)).toBe('* commun\n* ⟨24⟩ repentance');
  });
  it('génère des slugs stables', () => {
    expect(slugify("Mom's Box")).toBe('mom-s-box');
    expect(slugify('???')).toBe('bluebaby');
    expect(slugify('Éden Impur')).toBe('eden-impur');
  });
  it('libellés de versions', () => {
    expect(maskLabel(31)).toBe('Toutes versions');
    expect(maskLabel(24)).toBe('Depuis Repentance');
    expect(maskShort(28)).toBe('dès AB+');
  });
});
