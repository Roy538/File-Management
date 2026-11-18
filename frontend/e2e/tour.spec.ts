import { test } from '@playwright/test';
import { ADMIN, signIn } from './support';

/**
 * Screenshot tour of the main screens for design review. Runs only when TOUR=1:
 *   TOUR=1 TOUR_DIR=<folder> npx playwright test e2e/tour.spec.ts
 */
test.skip(!process.env.TOUR, 'design tour runs only with TOUR=1');

const dir = process.env.TOUR_DIR ?? 'tour';

test('screenshot tour', async ({ page }) => {
  await page.goto('/sign-in');
  await page.screenshot({ path: `${dir}/01-sign-in.png` });

  await signIn(page, ADMIN);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/02-launcher.png` });

  await page.goto('/explorer');
  await page.getByRole('button', { name: 'HR employee files' }).click();
  await page.getByRole('button', { name: 'Adrianne Gorie', exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/03-explorer.png` });

  await page.getByRole('link', { name: /^Offer letter - Adrianne Gorie/ }).first().click();
  await page.getByRole('tab', { name: 'Details' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/04-document.png` });

  await page.goto('/search?q=policy');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/05-search.png` });

  await page.goto('/admin/retention');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/06-retention.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/07-mobile-launcher.png` });
});
