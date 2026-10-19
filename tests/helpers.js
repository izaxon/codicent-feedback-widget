// @ts-check
const { expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const HARNESS = pathToFileURL(path.join(__dirname, 'harness.html')).href;
const API = 'https://api.test/codicent/issue-drafts';

/** Svarar på CORS-preflight och delegerar POST till handler. Returnerar listan av POST-requests. */
async function mockApi(page, handler) {
  const requests = [];
  await page.route(API, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push(req);
    if (handler) return handler(route, cors, req);
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'msg-1' }) });
  });
  return requests;
}

async function init(page, config) {
  await page.evaluate((c) => { window.__w = window.CodicentIssueWidget.init(Object.assign({ mount: '#mount' }, c)); }, config || {});
}

const q = (page, sel) => page.locator('#mount').locator(sel); // Playwright piercar öppen shadow DOM
const openDialog = async (page) => { await q(page, '.ciw-open').click(); await expect(q(page, '.ciw-panel')).toBeVisible(); };

module.exports = { HARNESS, API, mockApi, init, q, openDialog };
