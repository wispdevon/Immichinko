import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test('review, denial, retry, undo, keyboard, resume, completion, themes and mobile', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !m.text().includes('403') &&
      !m.text().includes('409') &&
      !m.text().includes('503')
    )
      errors.push(m.text());
  });
  await request.post('http://127.0.0.1:4311/fixture/reset');
  let failPreview = true;
  await page.route('**/api/preview/*', async (route) => {
    if (failPreview) {
      failPreview = false;
      await route.fulfill({ status: 503, body: 'Preview unavailable' });
    } else await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry preview' }).click();
  await expect(page).toHaveTitle('Immichinko · Daily photo rediscovery');
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible();
  const favorite = page.getByRole('button', {
    name: '♡ Favorite',
    exact: true,
  });
  await expect(favorite).toBeEnabled();
  await expect(page.locator('.stage img')).toBeVisible();
  expect(
    await page
      .locator('.stage img')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  expect(
    await page
      .locator('.stage img')
      .evaluate((img) => getComputedStyle(img).objectFit),
  ).toBe('contain');
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({
    path: 'docs/screenshots/today-desktop.png',
    fullPage: true,
  });
  const response = await request.get('/api/today');
  const raw = await response.text();
  expect(raw).not.toContain('fixture-secret');
  expect(raw).not.toContain('x-api-key');
  const batch = JSON.parse(raw);
  const cross = await request.post('/api/decisions', {
    headers: { Origin: 'https://untrusted.example' },
    data: {
      batch: batch.date,
      id: batch.photo.id,
      action: 'pass',
      requestId: 'cross-origin-000000',
    },
  });
  expect(cross.status()).toBe(403);
  const invalid = await request.post('/api/decisions', {
    headers: { Origin: 'http://127.0.0.1:4310' },
    data: {},
  });
  expect(invalid.status()).toBe(400);
  await request.post('http://127.0.0.1:4311/fixture/deny', {
    data: { denied: true },
  });
  await favorite.click();
  await expect(page.getByRole('alert')).toContainText('denied');
  await expect(page.getByText('0 / 10 reviewed')).toBeVisible();
  await request.post('http://127.0.0.1:4311/fixture/deny', {
    data: { denied: false },
  });
  await page.getByRole('button', { name: 'Retry decision' }).click();
  await expect(page.getByText('1 / 10 reviewed')).toBeVisible();
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await expect(page.getByText('0 / 10 reviewed')).toBeVisible();
  await expect(favorite).toBeEnabled();
  await page.locator('h1').click();
  await page.keyboard.press('f');
  await expect(page.getByText('1 / 10 reviewed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Later', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(page.getByText('2 / 10 reviewed')).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 / 10 reviewed')).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveClass('dark');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.locator('p[role=status]')).toHaveText(
    'Connected to Immich',
  );
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(favorite).toBeEnabled();
  await page.screenshot({
    path: 'docs/screenshots/today-dark.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(favorite).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/today-mobile.png',
    fullPage: true,
  });
  for (let i = 2; i < 10; i++) {
    await expect(
      page.getByRole('button', { name: 'Pass', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Pass', exact: true }).click();
    await expect(page.getByText(`${i + 1} / 10 reviewed`)).toBeVisible();
  }
  await expect(
    page.getByRole('heading', { name: 'A little closer to your favorites.' }),
  ).toBeVisible();
  await expect(page.getByText('10 reviewed · 1 favorites added')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/completed-mobile.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.locator('.metric strong')).toHaveText(['10', '1', '1']);
  await page.screenshot({
    path: 'docs/screenshots/progress-mobile.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme').selectOption('light');
  await expect(page.locator('html')).not.toHaveClass('dark');
  await page.getByLabel('Theme').selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass('dark');
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last decision' }).click();
  await expect(page.getByText('9 / 10 reviewed')).toBeVisible();
  await expect(favorite).toBeEnabled();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
  expect(errors).toEqual([]);
});
