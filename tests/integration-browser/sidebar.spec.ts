import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test('sidebar embeds review, preserves Immich, follows theme and supports mobile/back navigation', async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  expect((await request.get('/immichinko/api/today')).status()).toBe(401);
  await context.addCookies([
    {
      name: 'immich_access_token',
      value: 'fixture-session',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  await page.goto('/photos');
  await expect(page).toHaveTitle('Immich fixture');
  const entry = page.getByRole('link', { name: 'Immichinko', exact: true });
  await expect(entry).toBeVisible();
  expect(
    await page
      .locator('#immichinko-sidebar-row')
      .evaluate((row) => row.previousElementSibling?.textContent?.trim()),
  ).toBe('Sharing');
  await entry.click();
  await expect(page).toHaveURL(/#immichinko$/);
  await expect(page).toHaveTitle('Immichinko · Immich');
  const app = page.frameLocator('iframe[title="Immichinko photo review"]');
  await expect(
    app.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible();
  await expect(
    app.getByRole('button', { name: '♡ Favorite', exact: true }),
  ).toBeEnabled();
  await expect(app.locator('html')).toHaveClass('dark');
  await expect(page.locator('#original-content')).toBeHidden();
  await expect(
    page.locator('#immichinko-panel .immichinko-connection'),
  ).toBeHidden();
  expect(await page.locator('#sidebar a[aria-current=page]').count()).toBe(1);
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({
    path: 'docs/screenshots/integrated-desktop.png',
    fullPage: true,
  });
  await app.getByRole('button', { name: '♡ Favorite', exact: true }).click();
  await expect(app.getByText('1 / 10 reviewed')).toBeVisible();
  await app.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(app.locator('.metric strong')).toHaveText(['1', '1', '0']);
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await expect(app.locator('html')).not.toHaveClass('dark');
  await page.getByRole('button', { name: 'Back to Immich' }).click();
  await expect(page.locator('#original-content')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page).toHaveTitle('Immich fixture');
  await entry.click();
  await page.goBack();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.goForward();
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.getByRole('link', { name: 'Explore', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator('#sidebar')).toHaveAttribute('inert', '');
  await expect(
    app.getByRole('button', { name: 'Pass', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator('#sidebar')
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  await page.screenshot({
    path: 'docs/screenshots/integrated-mobile.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(app.getByText('1 / 10 reviewed')).toBeVisible();
  await context.clearCookies();
  await page.goto('/login');
  await expect(page.locator('#immichinko-sidebar-row')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});
