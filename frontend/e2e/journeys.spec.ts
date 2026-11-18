import { expect, test } from '@playwright/test';
import { ADMIN, AMINA, Api, GRACE, pdf, runId, signIn } from './support';

/**
 * The directive's critical user journeys, driven through the real UI against the real API.
 * Requires a running dev stack seeded with scripts/seed-demo.py (for the demo users).
 */

test.describe('sign-in and session', () => {
  test('wrong password is refused with a non-revealing message', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Organisation code').fill('MC');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('don’t match an active account');
  });

  test('the session survives a reload and ends on sign-out', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good to see you');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/explorer');
    await expect(page).toHaveURL(/\/sign-in$/);   // no session left to restore
  });
});

test('scenario A: upload through the dialog, then find the document in its folder', async ({ page, request }) => {
  const id = runId();
  const admin = await Api.as(request, ADMIN);
  await admin.cabinetWithFolder(`E2E ${id}`, 'Inbox');

  await signIn(page, GRACE);
  await page.getByRole('banner').getByRole('button', { name: 'Upload' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload documents' });
  await dialog.getByLabel('Cabinet').selectOption({ label: `E2E ${id}` });
  await dialog.getByLabel('Folder', { exact: true }).selectOption({ label: 'Inbox' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: `Board memo ${id}.pdf`, mimeType: 'application/pdf', buffer: pdf(['Board memo', 'Quarterly results summary']),
  });
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Document uploaded')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/explorer');
  await page.getByRole('button', { name: `E2E ${id}` }).click();
  await page.getByRole('button', { name: 'Inbox' }).first().click();
  await page.getByRole('link', { name: `Board memo ${id}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Board memo ${id}`);
  await page.getByRole('tab', { name: 'Versions' }).click();
  await expect(page.getByText('by you')).toBeVisible();
});

test('scenario B: content search finds a document by words inside it, highlighted', async ({ page, request }) => {
  const id = runId();
  const word = `zebracrossing${id}`;
  const admin = await Api.as(request, ADMIN);
  const { folderId } = await admin.cabinetWithFolder(`E2E search ${id}`, 'Contracts');
  const docId = await admin.upload(folderId, 'Supplier contract.pdf', pdf(['Supplier contract', `Clause 7 mentions ${word} explicitly.`]));
  await admin.waitUntilAvailable(docId);

  await signIn(page, ADMIN);
  await page.goto(`/search?q=${word}`);
  await expect(page.getByText('1 document found')).toBeVisible();
  await expect(page.locator('main mark').first()).toHaveText(new RegExp(word, 'i'));
  await page.getByRole('link', { name: 'Supplier contract' }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/${docId}$`));
});

test('scenario C: a department user sees only what they may use', async ({ page }) => {
  await signIn(page, AMINA);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Upload' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Administration')).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'You don’t have access to this page' })).toBeVisible();
});

test('scenario E: a reviewer requests changes and the author sees who asked and why', async ({ page, request }) => {
  const id = runId();
  const admin = await Api.as(request, ADMIN);
  const grace = await Api.as(request, GRACE);
  const { folderId } = await admin.cabinetWithFolder(`E2E review ${id}`, 'Policies');
  const workflow = await admin.call<{ id: string }>('POST', '/workflows', {
    name: `E2E review ${id}`, steps: [{ name: 'Department check', approvalMode: 'ANY', assigneeRole: 'DEPT_USER' }],
  });
  const docId = await grace.upload(folderId, `Travel policy ${id}.pdf`, pdf(['Travel policy', 'Economy class for all trips.']));
  await grace.waitUntilAvailable(docId);
  await grace.call('POST', `/documents/${docId}/reviews`, { definitionId: workflow.id, comment: 'Please check' });

  // The reviewer decides from "My reviews".
  await signIn(page, AMINA);
  await page.goto('/tasks');
  const row = page.getByRole('row', { name: new RegExp(`Travel policy ${id}`) });
  await row.getByRole('button', { name: 'Decide' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Request changes/).check();
  await dialog.getByRole('button', { name: 'Request changes' }).click();
  await expect(dialog.getByText(/reason|explain/i).first()).toBeVisible();   // a reason is required
  await dialog.getByLabel(/Comment|Reason/).fill('Add the per-diem rates');
  await dialog.getByRole('button', { name: 'Request changes' }).click();
  await expect(page.getByText('Changes requested').first()).toBeVisible();

  // The author sees the outcome, by name, with the reason.
  const author = await page.context().browser()!.newContext();
  const authorPage = await author.newPage();
  await signIn(authorPage, GRACE);
  await authorPage.goto(`/documents/${docId}`);
  await authorPage.getByRole('tab', { name: 'Reviews' }).click();
  await expect(authorPage.getByText(`by ${AMINA.name}`)).toBeVisible();
  await expect(authorPage.getByText('“Add the per-diem rates”')).toBeVisible();
  await author.close();
});
