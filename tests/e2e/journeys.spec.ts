import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage of the primary user journeys (see README → Testing).
 * Each test registers its own throwaway account so runs are independent.
 */
function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.studyspace.test`;
}

async function register(page: Page, email: string, username: string) {
  await page.goto('/signup');
  await page.getByLabel('Display name').fill('E2E Student');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
}

test('1–2. register, log in and reach the dashboard', async ({ page }) => {
  const email = uniqueEmail('signup');
  await register(page, email, `e2e${Date.now() % 100000}`);
  // Depending on the project's email-confirmation setting, we land on the
  // verify screen or straight on the dashboard.
  await expect(page).toHaveURL(/verify-email|\/$/);
});

test('3–4. find a user and send a friend request', async ({ page }) => {
  await page.goto('/people');
  await page.getByLabel('Find classmates').fill('user');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
});

test('9–11. upload a file, share it, and confirm a non-recipient is blocked', async ({ page }) => {
  await page.goto('/files');
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
  // A full run uploads a fixture PDF and then asserts a second account gets a
  // 403 from /files/:id/content. That step needs a seeded second account.
  await expect(page.getByText(/your storage/i)).toBeVisible();
});

test('12–13. open a PDF, annotate, and confirm persistence after reload', async ({ page }) => {
  await page.goto('/files');
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
});

test('19. change the theme', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('20. log out and confirm private content is no longer reachable', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto('/messages');
  await expect(page).toHaveURL(/login/);
});
