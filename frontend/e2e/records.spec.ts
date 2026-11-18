import { expect, test } from '@playwright/test';
import { AMINA, Api, GRACE, runId, signIn } from './support';

/** Physical file tracking: register → request → approve → lend → take back, then report and export. */
test('registry: a file is registered, requested, lent out and taken back', async ({ page, request }) => {
  const number = `E2E/${runId()}`.toUpperCase();

  // Grace (records officer) registers the file through the UI.
  await signIn(page, GRACE);
  await page.getByRole('link', { name: 'File register' }).first().click();
  await page.getByRole('button', { name: 'Register a file' }).first().click();
  const register = page.getByRole('dialog', { name: 'Register a file' });
  await register.getByLabel('File number').fill(number);
  await register.getByLabel('Customer').fill('E2E Customer');
  await register.getByLabel('Shelf').fill('E2E shelf 1');
  await register.getByRole('button', { name: 'Register file' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(number);
  await expect(page.getByLabel('Where the file is')).toContainText('In registry');
  const fileUrl = page.url();

  // Amina (department user) asks for it; she can't lend it out herself.
  const amina = await Api.as(request, AMINA);
  const fileId = fileUrl.split('/').pop()!;
  await amina.call('POST', '/records/requests', { fileId, department: 'Credit', purpose: 'E2E review' });

  // Grace approves the request on the file page and lends the file against it.
  await page.reload();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved, not yet sent')).toBeVisible();
  await page.getByRole('listitem').getByRole('button', { name: 'Lend out' }).click();
  const lend = page.getByRole('dialog');
  await expect(lend.getByLabel('Department')).toHaveValue('Credit');
  await lend.getByLabel('Taken by').fill('Mary Achieng');
  await lend.getByRole('button', { name: 'Lend out' }).click();
  await expect(page.getByLabel('Where the file is')).toContainText('Mary Achieng');
  await expect(page.getByLabel('Where the file is')).toContainText('On loan');

  // It shows on the loans page, and is taken back to the wrong place (which needs a location).
  await page.getByRole('link', { name: 'Files on loan' }).first().click();
  await expect(page.getByRole('link', { name: number })).toBeVisible();
  await page.goto(fileUrl);
  await page.getByRole('button', { name: 'Take back' }).first().click();
  const back = page.getByRole('dialog');
  await back.getByLabel('Worn').check();
  await back.getByLabel(/Somewhere else/).check();
  await back.getByRole('button', { name: 'Record return' }).click();
  await expect(back.getByText('Say where it was actually put')).toBeVisible();
  await back.getByLabel('Actually put at').fill('E2E shelf 9');
  await back.getByRole('button', { name: 'Record return' }).click();
  await expect(page.getByLabel('Where the file is')).toContainText('Returned, to shelve');
  await expect(page.getByLabel('Where the file is')).toContainText('E2E shelf 9');

  // The ledger shows each step, newest first.
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'History' }) });
  await expect(history.getByText('Returned').first()).toBeVisible();
  await expect(history.getByText('Lent out')).toBeVisible();
  await expect(history.getByText('Registered')).toBeVisible();
});

test('registry reports show on screen and download as PDF', async ({ page }) => {
  await signIn(page, GRACE);
  await page.goto('/reports?type=by-department');
  await expect(page.getByRole('heading', { name: 'Files by department' })).toBeVisible();
  await expect(page.locator('tfoot')).toContainText('All departments');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^by-department-.*\.pdf$/);
});

test('a department user can ask for files but not lend them or run reports', async ({ page }) => {
  await signIn(page, AMINA);
  await expect(page.getByRole('link', { name: 'File register' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await page.goto('/records');
  await expect(page.getByRole('button', { name: 'Register a file' })).toHaveCount(0);
});
