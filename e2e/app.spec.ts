import { expect, test } from '@playwright/test';

test.describe('parcours essentiels', () => {
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
