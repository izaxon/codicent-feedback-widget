// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const DEMO = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const LEGACY = pathToFileURL(path.join(__dirname, '..', 'demo.html')).href;

test('demon startar utan konsolfel och alla fyra widgetar monteras', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(DEMO);
  await expect(page.locator('.ciw-open')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('demons CSS-tema (variabler på förfader) syns på widgeten i avsnitt 2', async ({ page }) => {
  await page.goto(DEMO);
  const bg = await page.locator('section.lila-tema .ciw-open').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(124, 58, 237)');
});

test('demon: skicka i demo-läge visar tack och loggen uppdateras', async ({ page }) => {
  await page.goto(DEMO);
  const w = page.locator('#js-config-mount');
  await w.locator('.ciw-open').click();
  await w.locator('#ciw-body').fill('demo-rapport');
  await w.locator('.ciw-send').click();
  await expect(w.locator('.ciw-done-text')).toContainText('Demo-läge');
  await expect(page.locator('#log')).toContainText('demo-rapport');
});

test('engelska demon och egen send()', async ({ page }) => {
  await page.goto(DEMO);
  const w = page.locator('#en-mount');
  await expect(w.locator('.ciw-open')).toHaveText('Report a problem');
  await w.locator('.ciw-open').click();
  await w.locator('#ciw-body').fill('english report');
  await w.locator('.ciw-send').click();
  await expect(w.locator('.ciw-done-text')).toContainText('Demo mode');
});

test('demo.html vidarebefordrar till index.html', async ({ page }) => {
  await page.goto(LEGACY);
  await page.waitForURL(/index\.html$/);
  await expect(page.locator('.ciw-open').first()).toBeVisible();
});
