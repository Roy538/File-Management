import { test } from '@playwright/test';
import { GRACE, signIn } from './support';

/** Screenshot tour of the registry screens for design review. Runs only when TOUR=1. */
test.skip(!process.env.TOUR, 'design tour runs only with TOUR=1');

const dir = process.env.TOUR_DIR ?? 'tour';

test('registry screenshot tour', async ({ page }) => {
  await signIn(page, GRACE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r1-launcher.png`, fullPage: true });

  await page.goto('/records');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r2-register.png`, fullPage: true });

  await page.getByRole('link', { name: 'LN/2024/0117' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r3-file-on-loan.png`, fullPage: true });

  await page.goto('/records');
  await page.getByRole('link', { name: 'LN/2024/0342' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r4-file-missing.png`, fullPage: true });

  await page.goto('/records/loans');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r5-loans.png`, fullPage: true });

  await page.goto('/records/requests');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r6-requests.png`, fullPage: true });

  await page.goto('/reports?type=by-department');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/r7-report.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/records');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/r8-register-phone.png`, fullPage: true });
});
