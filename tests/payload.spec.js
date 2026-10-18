// @ts-check
const { test, expect } = require('@playwright/test');
const { HARNESS, API, mockApi, init, q, openDialog } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS + '?reset_token=secret123#section');
});

async function sendText(page, text) {
  await openDialog(page);
  await q(page, '#ciw-body').fill(text);
  await q(page, '.ciw-send').click();
}

test.describe('kontrakt och integritet', () => {
  test('klienten skickar bara { project, payload } — ingen text/tags', async ({ page }) => {
    const reqs = await mockApi(page);
    await init(page, { project: 'p', endpoint: API });
    await sendText(page, 'något är fel');
    await expect(q(page, '.ciw-done')).toBeVisible();
    const body = JSON.parse(reqs[0].postData());
    expect(Object.keys(body).sort()).toEqual(['payload', 'project']);
    expect(body.payload.body).toBe('något är fel');
    expect(body.payload.source).toMatch(/^issue-widget\//);
    expect(body.payload.client_id).toBeTruthy();
    expect(body.payload).toHaveProperty('client_created_at');
    expect(body.payload).not.toHaveProperty('created_at');
  });

  test('page_url saknar query och hash som standard; user_agent skickas inte', async ({ page }) => {
    const reqs = await mockApi(page);
    await init(page, { project: 'p', endpoint: API });
    await sendText(page, 'hej');
    await expect(q(page, '.ciw-done')).toBeVisible();
    const { payload } = JSON.parse(reqs[0].postData());
    expect(payload.page_url).toMatch(/harness\.html$/);
    expect(payload.page_url).not.toContain('secret123');
    expect(payload).not.toHaveProperty('user_agent');
  });

  test('pageUrl: full, none och includeUserAgent', async ({ page }) => {
    const reqs = await mockApi(page);
    await init(page, { project: 'p', endpoint: API, pageUrl: 'full', includeUserAgent: true });
    await sendText(page, 'a');
    await expect(q(page, '.ciw-done')).toBeVisible();
    let { payload } = JSON.parse(reqs[0].postData());
    expect(payload.page_url).toContain('reset_token=secret123#section'.split('#')[0]);
    expect(payload.user_agent).toContain('Mozilla');

    await page.evaluate(() => window.__w.destroy());
    await init(page, { project: 'p', endpoint: API, pageUrl: 'none' });
    await sendText(page, 'b');
    await expect(q(page, '.ciw-done')).toBeVisible();
    ({ payload } = JSON.parse(reqs[1].postData()));
    expect(payload).not.toHaveProperty('page_url');
  });

  test('client_id är stabilt vid omförsök och nytt efter lyckat skick', async ({ page }) => {
    let n = 0;
    const reqs = await mockApi(page, (route, cors) => {
      n++;
      if (n === 1) return route.fulfill({ status: 503, headers: cors });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'm' + n }) });
    });
    await init(page, { project: 'p', endpoint: API });
    await sendText(page, 'första');
    await expect(q(page, '.ciw-status')).toContainText('Servern svarade');
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-done')).toBeVisible();
    await q(page, '.ciw-another').click();
    await q(page, '#ciw-body').fill('andra');
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-done')).toBeVisible();
    const ids = reqs.map((r) => JSON.parse(r.postData()).payload.client_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  test('config.send ersätter adaptern (och kräver varken endpoint eller demo)', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.evaluate(() => {
      window.__sent = [];
      window.__w = window.CodicentIssueWidget.init({
        mount: '#mount', project: 'p',
        send: async (payload) => { window.__sent.push(payload.body); return { ok: true, id: 'custom' }; }
      });
    });
    await sendText(page, 'via hook');
    await expect(q(page, '.ciw-done')).toBeVisible();
    expect(await page.evaluate(() => window.__sent)).toEqual(['via hook']);
    expect(errors).toEqual([]);
  });
});

test.describe('felmeddelanden', () => {
  const cases = [
    [401, 'får inte skicka'],
    [403, 'får inte skicka'],
    [413, 'för stort'],
    [429, 'För många rapporter'],
    [400, 'avvisades'],
    [500, 'Servern svarade']
  ];
  for (const [status, text] of cases) {
    test(`HTTP ${status} ger begripligt meddelande`, async ({ page }) => {
      await mockApi(page, (route, cors) => route.fulfill({ status, headers: cors }));
      await init(page, { project: 'p', endpoint: API });
      await sendText(page, 'hej');
      await expect(q(page, '.ciw-status')).toContainText(text);
      await expect(q(page, '.ciw-send')).toBeEnabled();
    });
  }

  test('nätverksfel ger nätverksmeddelande', async ({ page }) => {
    await page.route(API, (route) => route.abort('failed'));
    await init(page, { project: 'p', endpoint: API });
    await sendText(page, 'hej');
    await expect(q(page, '.ciw-status')).toContainText('Nätverksfel');
  });
});

test.describe('gränser, språk och integritetsnotis', () => {
  test('textarea har maxlength och räknare', async ({ page }) => {
    await init(page, { project: 'p', demo: true, maxBodyLength: 50 });
    await openDialog(page);
    await expect(q(page, '#ciw-body')).toHaveAttribute('maxlength', '50');
    await q(page, '#ciw-body').fill('abc');
    await expect(q(page, '.ciw-counter')).toHaveText('3 / 50 tecken');
  });

  test('lang: en byter alla texter', async ({ page }) => {
    await init(page, { project: 'p', demo: true, lang: 'en' });
    await expect(q(page, '.ciw-open')).toHaveText('Report a problem');
    await openDialog(page);
    await expect(q(page, '.ciw-send')).toHaveText('Send as draft');
    await expect(q(page, '.ciw-counter')).toContainText('characters');
  });

  test('messages åsidosätter enskilda texter', async ({ page }) => {
    await init(page, { project: 'p', demo: true, messages: { send: 'Skicka nu' } });
    await openDialog(page);
    await expect(q(page, '.ciw-send')).toHaveText('Skicka nu');
  });

  test('integritetsnotis visas; länk bara för http(s) och rot-relativa adresser', async ({ page }) => {
    await init(page, { project: 'p', demo: true, privacyUrl: 'https://example.com/privacy' });
    await openDialog(page);
    await expect(q(page, '.ciw-privacy')).toContainText('Vi sparar din rapport');
    await expect(q(page, '.ciw-privacy a')).toHaveAttribute('href', 'https://example.com/privacy');
    await expect(q(page, '.ciw-privacy a')).toHaveAttribute('rel', /noopener/);

    await page.evaluate(() => window.__w.destroy());
    await init(page, { project: 'p', demo: true, privacyUrl: 'javascript:alert(1)' });
    await openDialog(page);
    await expect(q(page, '.ciw-privacy a')).toHaveCount(0);
  });

  test('tom privacyNotice döljer notisen', async ({ page }) => {
    await init(page, { project: 'p', demo: true, messages: { privacyNotice: '' } });
    await openDialog(page);
    await expect(q(page, '.ciw-privacy')).toHaveCount(0);
  });

  test('ljud: MIME utan codecs-parameter, och storleksgräns', async ({ page }) => {
    const reqs = await mockApi(page);
    await init(page, { project: 'p', endpoint: API });
    await openDialog(page);
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-record')).toHaveClass(/recording/);
    await page.waitForTimeout(600);
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-audio')).toBeVisible();
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-done')).toBeVisible();
    const post = reqs[0].postData();
    expect(post).toMatch(/Content-Type: audio\/(webm|ogg|mp4)\r?\n/);
    expect(post).not.toContain('codecs');
    expect(JSON.parse(/name="payload"\r?\n\r?\n([\s\S]*?)\r?\n--/.exec(post)[1]).audio.mime_type).toMatch(/^audio\/[a-z0-9]+$/);

    await page.evaluate(() => window.__w.destroy());
    await init(page, { project: 'p', endpoint: API, maxAudioBytes: 500 });
    await openDialog(page);
    await q(page, '.ciw-record').click();
    await page.waitForTimeout(600);
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-audio-status')).toContainText('för stor');
    await expect(q(page, '.ciw-audio')).toBeHidden();
  });
});
