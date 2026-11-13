#!/usr/bin/env node
/**
 * Déploiement : vérifications → commit → push sur GitHub (main). Vercel redéploie automatiquement à chaque push.
 *
 *   npm run deploy                         message de commit automatique
 *   npm run deploy -- "Ajout des guides"   message personnalisé
 *   npm run deploy -- --skip-tests         sans les tests (déconseillé)
 *   npm run deploy -- --dry-run            vérifie tout sans committer ni pousser
 *
 * Le déploiement s'arrête à la première erreur (types, tests, build, git) : rien n'est poussé.
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const message = args.find((a) => !a.startsWith('--'));
const BRANCH = 'main';

const c = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m' };
const step = (label) => console.log(`\n${c.cyan}▶ ${label}${c.reset}`);
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`\n${c.red}✖ ${msg}${c.reset}`);
  process.exit(1);
};

try {
  step('Vérification du dépôt git');
  const branch = out('git rev-parse --abbrev-ref HEAD');
  if (branch !== BRANCH) fail(`Vous êtes sur la branche « ${branch} ». Le déploiement se fait depuis « ${BRANCH} » (git switch ${BRANCH}).`);
  const remote = out('git remote get-url origin');
  console.log(`${c.dim}branche ${branch} → ${remote}${c.reset}`);
  run(`git fetch origin ${BRANCH} --quiet`);
  const behind = Number(out(`git rev-list --count HEAD..origin/${BRANCH}`));
  if (behind > 0) {
    step(`Récupération de ${behind} commit(s) distant(s)`);
    run(`git pull --rebase --autostash origin ${BRANCH}`);
  }

  step('Vérification des types');
  run('npm run typecheck --silent');

  if (!has('--skip-tests')) {
    step('Tests');
    run('npm test --silent');
  } else console.log(`${c.yellow}Tests ignorés (--skip-tests).${c.reset}`);

  step('Build de production');
  run('npm run build --silent');

  const dirty = out('git status --porcelain');
  if (has('--dry-run')) {
    console.log(`\n${c.green}✔ Tout est prêt.${c.reset} ${dirty ? 'Des modifications seraient commitées.' : 'Aucune modification locale.'} (--dry-run : rien n'est poussé)`);
    process.exit(0);
  }

  if (dirty) {
    step('Commit des modifications');
    run('git add -A');
    const stamp = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    execSync('git commit -F -', { input: message ?? `Déploiement du ${stamp}`, stdio: ['pipe', 'inherit', 'inherit'] });
  } else {
    console.log(`${c.dim}Aucune modification locale à committer.${c.reset}`);
  }

  const ahead = Number(out(`git rev-list --count origin/${BRANCH}..HEAD`));
  if (ahead === 0) {
    console.log(`\n${c.green}✔ GitHub est déjà à jour : rien à déployer.${c.reset}`);
    process.exit(0);
  }

  step(`Push de ${ahead} commit(s) vers GitHub`);
  run(`git push origin ${BRANCH}`);

  const sha = out('git rev-parse --short HEAD');
  const repo = remote.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  console.log(`\n${c.green}✔ Déployé (${sha}).${c.reset} Vercel construit la nouvelle version : ${repo}/commit/${sha}`);
} catch (e) {
  fail(`Déploiement interrompu${e?.status ? ` (code ${e.status})` : ''}. Rien n'a été poussé après l'étape en échec.`);
}
