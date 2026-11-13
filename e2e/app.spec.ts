/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'motdepasse-e2e';

/** Plus de session invité : chaque test commence par créer un compte unique. */
async function signUp(page: Page, name = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Créer un compte' }).click();
  await page.getByTestId('auth-name').fill(name);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-confirm').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('open-search')).toBeVisible();
  return name;
}

test.describe('compte obligatoire', () => {
  test("affiche l'écran de connexion, crée un compte, se déconnecte puis se reconnecte", async ({ page }) => {
    await page.goto('/objets');
    await expect(page.getByTestId('auth-submit')).toBeVisible();
    await expect(page.getByTestId('open-search')).toHaveCount(0);
    const name = await signUp(page);
    await page.goto('/profil');
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('auth-submit')).toBeVisible();
    await page.getByRole('tab', { name: 'Se connecter' }).click();
    await page.getByTestId('auth-name').fill(name);
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('open-search')).toBeVisible();
  });
});

test.describe('parcours essentiels', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await signUp(page);
  });

  test('ouvrir et fermer le menu mobile en glissant le doigt', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'geste propre au mobile');
    const swipe = (fromX: number, toX: number) =>
      page.evaluate(
        ([a, b]) => {
          const target = document.querySelector('main')!;
          const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 300 });
          target.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(a!)], changedTouches: [touch(a!)], bubbles: true }));
          target.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(b!)], bubbles: true }));
        },
        [fromX, toX],
      );
    await expect(page.getByRole('button', { name: 'Fermer le menu' })).toHaveCount(0);
    await swipe(20, 220);
    await expect(page.getByRole('button', { name: 'Fermer le menu' })).toBeVisible();
    await swipe(250, 30);
    await expect(page.getByRole('button', { name: 'Fermer le menu' })).toHaveCount(0);
  });

  test('changer rapidement de personnage', async ({ page }) => {
    await page.goto('/personnages/isaac');
    await expect(page.getByTestId('character-switcher')).toBeVisible();
    await page.getByRole('link', { name: /Personnage suivant/ }).click();
    await expect(page).toHaveURL(/\/personnages\/magdalene$/);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/personnages\/isaac$/);
    await page.getByRole('link', { name: /^(Tainted|Voir Tainted Isaac)$/ }).click();
    await expect(page).toHaveURL(/\/personnages\/tainted-isaac$/);
  });

  test('rechercher un objet et ouvrir sa fiche', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('open-search').click();
    await page.getByTestId('global-search-input').fill('brimstnoe');
    await page.getByTestId('search-result').first().click();
    await expect(page).toHaveURL(/\/objets\/118$/);
    await expect(page.getByTestId('item-title')).toContainText(/Soufre|Brimstone/);
    await expect(page.getByText(/Synergies \(\d+\)/)).toBeVisible();
  });

  test('consulter un personnage, ses déblocages et valider une marque', async ({ page }) => {
    await page.goto('/personnages');
    await expect(page.getByTestId('character-card')).toHaveCount(17);
    await page.getByTestId('character-card').first().click();
    await expect(page).toHaveURL(/\/personnages\/isaac$/);
    const lamb = page.getByTestId('mark-lamb');
    await expect(lamb).toHaveAttribute('data-state', 'none');
    await expect(page.getByText('Missing Poster')).toBeVisible();
    await lamb.click();
    await expect(lamb).toHaveAttribute('data-state', 'normal');
    // La récompense associée passe à « Débloqué ».
    await expect(page.getByRole('link', { name: /Missing Poster/ }).getByText('Débloqué')).toBeVisible();
    await lamb.click();
    await expect(lamb).toHaveAttribute('data-state', 'hard');
    await page.reload();
    await expect(page.getByTestId('mark-lamb')).toHaveAttribute('data-state', 'hard');
  });

  test('filtrer les objets', async ({ page }) => {
    await page.goto('/objets?quality=4&type=active');
    await expect(page.getByTestId('items-count')).toContainText('résultat');
    await expect(page.getByTestId('item-card').first()).toBeVisible();
    await page.getByTestId('items-search').fill('d6');
    await expect(page.getByTestId('item-card').first()).toContainText(/D6/);
  });

  test('suivi des dons et calcul de progression', async ({ page }) => {
    await page.goto('/dons');
    const input = page.getByTestId('donation-input-donation');
    await input.fill('120');
    await input.press('Enter');
    await expect(page.getByTestId('milestones-donation').locator('li').nth(3)).toHaveClass(/bg-ok/);
    await page.goto('/succes');
    await page.getByTestId('unlocks-search').fill('Store Upgrade lv.2');
    await expect(page.getByTestId('unlock-row').first().locator('span', { hasText: /^Débloqué$/ })).toBeVisible();
  });

  test('consulter les synergies et le simulateur', async ({ page }) => {
    await page.goto('/simulateur');
    await page.getByTestId('build-picker').fill('sad onion');
    await page.getByTestId('picker-option').first().click();
    await expect(page.getByTestId('build-items')).toContainText(/Oignon|Onion/);
    await expect(page.getByText('+0.7')).toBeVisible();
  });

  test('exporter puis importer un profil', async ({ page }) => {
    await page.goto('/profil');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-profile').click();
    const file = await (await download).path();
    expect(file).toBeTruthy();
    await page.getByTestId('import-file').setInputFiles(file!);
    await expect(page.getByText(/Import réussi/)).toBeVisible();
  });

  test('le planificateur propose des objectifs', async ({ page }) => {
    await page.goto('/planificateur');
    await expect(page.getByTestId('recommendations').locator('li').first()).toBeVisible();
    await expect(page.getByTestId('planner-path')).toHaveCount(7);
  });
});
