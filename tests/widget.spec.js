// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const { HARNESS, API, mockApi, init, q, openDialog } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
});

test('CSS-variabler på en förfader styr widgeten (inte bara mount-elementet)', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  const style = await q(page, '.ciw-open').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
  });
  expect(style.bg).toBe('rgb(124, 58, 237)');
  expect(style.radius).not.toBe('12px');
});

test('standardutseende utan variabler', async ({ page }) => {
  await page.evaluate(() => window.CodicentIssueWidget.init({ mount: '#mount2', project: 'p', demo: true }));
  const bg = await page.locator('#mount2').locator('.ciw-open').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(37, 99, 235)');
});

test('Escape efter stängning stjäl inte fokus från sidan', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await openDialog(page);
  await q(page, '.ciw-cancel').click();
  await page.locator('#outside').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#outside')).toBeFocused();
});

test('Escape stänger dialogen och bevarar utkastet', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await openDialog(page);
  await q(page, '#ciw-body').fill('halvskrivet');
  await page.keyboard.press('Escape');
  await expect(q(page, '.ciw-panel')).toHaveCount(0);
  await openDialog(page);
  await expect(q(page, '#ciw-body')).toHaveValue('halvskrivet');
  await expect(q(page, '.ciw-status')).toContainText('återställts');
});

test('Avbryt kastar utkastet', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await openDialog(page);
  await q(page, '#ciw-body').fill('kastas');
  await q(page, '.ciw-cancel').click();
  await openDialog(page);
  await expect(q(page, '#ciw-body')).toHaveValue('');
});

test('open() två gånger ger bara en dialog', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await page.evaluate(() => { window.__w.open(); window.__w.open(); });
  await expect(q(page, '.ciw-overlay')).toHaveCount(1);
});

test('init två gånger på samma mount är idempotent', async ({ page }) => {
  const same = await page.evaluate(() => {
    const a = window.CodicentIssueWidget.init({ mount: '#mount', project: 'p', demo: true });
    const b = window.CodicentIssueWidget.init({ mount: '#mount', project: 'p', demo: true });
    return a === b;
  });
  expect(same).toBe(true);
  await expect(q(page, '.ciw-open')).toHaveCount(1);
});

test('destroy() tar bort widgeten och tillåter ny init', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await page.evaluate(() => window.__w.destroy());
  await expect(q(page, '.ciw-open')).toHaveCount(0);
  await init(page, { project: 'p', demo: true });
  await expect(q(page, '.ciw-open')).toHaveCount(1);
});

test('saknat projekt startar inte widgeten och loggar fel', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const result = await page.evaluate(() => window.CodicentIssueWidget.init({ mount: '#mount' }));
  expect(result).toBeNull();
  await expect(q(page, '.ciw-open')).toHaveCount(0);
  expect(errors.join('\n')).toContain('Inget projekt');
});

test('dra markering från textfältet ut på bakgrunden stänger inte dialogen', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await openDialog(page);
  const box = await q(page, '#ciw-body').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(2, 2); // bakgrunden, utanför panelen
  await page.mouse.up();
  await expect(q(page, '.ciw-panel')).toBeVisible();
  // ett riktigt klick på bakgrunden stänger fortfarande
  await page.mouse.click(2, 2);
  await expect(q(page, '.ciw-panel')).toHaveCount(0);
});

test('Tab fastnar inom dialogen', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  await openDialog(page);
  await q(page, '.ciw-cancel').focus();
  await page.keyboard.press('Tab');
  await expect(q(page, '#ciw-title-input')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(q(page, '.ciw-cancel')).toBeFocused();
});

test('utan endpoint och utan demo: tydligt fel i stället för falsk framgång', async ({ page }) => {
  await init(page, { project: 'p' });
  await openDialog(page);
  await q(page, '#ciw-body').fill('hej');
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-status')).toContainText('inte konfigurerad');
  await expect(q(page, '.ciw-done')).toBeHidden();
});

test('demo: true visar demo-bekräftelse och avfyrar event', async ({ page }) => {
  await init(page, { project: 'p', demo: true });
  const fired = page.evaluate(() => new Promise((r) => document.addEventListener('codicent-issue:submitted', (e) => r(e.detail.payload.project), { once: true })));
  await openDialog(page);
  await q(page, '#ciw-body').fill('hej');
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-done-text')).toContainText('Demo-läge');
  expect(await fired).toBe('p');
});

test('lyckat skick visar tack-vy, "Skicka en till" återgår till tomt formulär', async ({ page }) => {
  const reqs = await mockApi(page);
  await init(page, { project: 'p', endpoint: API, apiKey: 'k1' });
  await openDialog(page);
  await q(page, '#ciw-body').fill('något är fel');
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-done-text')).toContainText('#issue-draft #p');
  expect(reqs).toHaveLength(1);
  expect(reqs[0].headers()['x-api-key']).toBe('k1');
  await q(page, '.ciw-another').click();
  await expect(q(page, '#ciw-body')).toHaveValue('');
  await expect(q(page, '#ciw-body')).toBeVisible();
});

test('2xx utan id räknas som fel', async ({ page }) => {
  await mockApi(page, (route, cors) => route.fulfill({ status: 200, headers: cors, contentType: 'text/html', body: '<html>SPA</html>' }));
  await init(page, { project: 'p', endpoint: API });
  await openDialog(page);
  await q(page, '#ciw-body').fill('hej');
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-status')).toContainText('Kunde inte skicka');
  await expect(q(page, '.ciw-send')).toBeEnabled();
});

test('hängande anrop avbryts efter timeoutMs och kan skickas om', async ({ page }) => {
  await mockApi(page, () => { /* svarar aldrig */ });
  await init(page, { project: 'p', endpoint: API, timeoutMs: 400 });
  await openDialog(page);
  await q(page, '#ciw-body').fill('hej');
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-status')).toContainText('Tidsgränsen', { timeout: 5000 });
  await expect(q(page, '.ciw-send')).toBeEnabled();
});

test('lång emoji-text ger kodpunktssäker titel', async ({ page }) => {
  const reqs = await mockApi(page);
  await init(page, { project: 'p', endpoint: API });
  await openDialog(page);
  await q(page, '#ciw-body').fill('😀'.repeat(100));
  await q(page, '.ciw-send').click();
  await expect(q(page, '.ciw-done')).toBeVisible();
  const title = JSON.parse(reqs[0].postData()).payload.title;
  expect(Array.from(title).length).toBe(81); // 80 kodpunkter + …
  expect(title.endsWith('…')).toBe(true);
});

test('auto-init läser data-attribut', async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, 'harness-auto.html')).href);
  await expect(page.locator('#a').locator('.ciw-open')).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('#a').shadowRoot === null)).toBe(true); // mount-elementet rörs inte
  await page.locator('#a').locator('.ciw-open').click();
  await expect(page.locator('#a').locator('.ciw-panel')).toContainText('#attr-proj');
});

test('projektbyte: dropdown bara med allowProjectSwitch', async ({ page }) => {
  await init(page, { projects: 'a,b' });
  await openDialog(page);
  await expect(q(page, 'select#ciw-project')).toHaveCount(0);
  await page.evaluate(() => window.__w.destroy());
  await init(page, { projects: 'a,b', allowProjectSwitch: true });
  await openDialog(page);
  await expect(q(page, 'select#ciw-project')).toHaveCount(1);
});

test.describe('ljud', () => {
  async function record(page, ms = 700) {
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-record')).toHaveClass(/recording/);
    await page.waitForTimeout(ms);
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-audio')).toBeVisible();
  }

  test('inspelning och multipart-skick', async ({ page }) => {
    const reqs = await mockApi(page);
    await init(page, { project: 'p', endpoint: API });
    await openDialog(page);
    await record(page);
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-done')).toBeVisible();
    expect(reqs[0].headers()['content-type']).toContain('multipart/form-data');
    expect(reqs[0].postData()).toContain('name="audio"; filename="issue-voice-');
  });

  test('mikrofonen släpps om dialogen stängs under behörighetsfrågan', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await page.evaluate(() => {
      window.__tracksStopped = 0;
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        await new Promise((r) => { window.__grant = r; });
        const s = await real(c);
        s.getTracks().forEach((t) => { const stop = t.stop.bind(t); t.stop = () => { window.__tracksStopped++; stop(); }; });
        return s;
      };
    });
    await openDialog(page);
    await q(page, '.ciw-record').click();
    await page.keyboard.press('Escape');
    await expect(q(page, '.ciw-panel')).toHaveCount(0);
    await page.evaluate(() => window.__grant());
    await expect.poll(() => page.evaluate(() => window.__tracksStopped)).toBeGreaterThan(0);
  });

  test('nekad mikrofon raderar inte en tidigare inspelning', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await openDialog(page);
    await record(page);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-audio-status')).toContainText('nekades');
    await expect(q(page, '.ciw-audio')).toBeVisible();
  });

  test('ljudutkast bevaras när dialogen stängs med Escape', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await openDialog(page);
    await record(page);
    await page.keyboard.press('Escape');
    await openDialog(page);
    await expect(q(page, '.ciw-audio')).toBeVisible();
    expect(await q(page, '.ciw-audio-preview').evaluate((a) => a.src.startsWith('blob:'))).toBe(true);
  });

  test('skick under pågående inspelning blockeras', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await openDialog(page);
    await q(page, '#ciw-body').fill('text');
    await q(page, '.ciw-record').click();
    await expect(q(page, '.ciw-record')).toHaveClass(/recording/);
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-status')).toContainText('Stoppa inspelningen');
  });
});

test.describe('röstifyllning', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__recs = [];
      const Fake = class {
        constructor() { window.__recs.push(this); }
        start() {}
        stop() { setTimeout(() => this.onend && this.onend(), 0); }
      };
      window.SpeechRecognition = Fake; // nyare Chrome har den oprefixade; widgeten föredrar den
      window.webkitSpeechRecognition = Fake;
    });
    await page.goto(HARNESS);
  });

  test('sena resultat skriver inte in text efter skick', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await openDialog(page);
    await q(page, '.ciw-rec').click();
    await q(page, '#ciw-body').fill('klar text');
    await q(page, '.ciw-send').click();
    await expect(q(page, '.ciw-done')).toBeVisible();
    await q(page, '.ciw-another').click();
    await page.evaluate(() => {
      window.__recs[0].onresult({ results: [[{ transcript: 'sent efterskott' }]] });
    });
    await expect(q(page, '#ciw-body')).toHaveValue('');
  });

  test('gammal onend nollar inte en nystartad session', async ({ page }) => {
    await init(page, { project: 'p', demo: true });
    await openDialog(page);
    await q(page, '.ciw-rec').click();
    await q(page, '.ciw-rec').click(); // stoppa
    await q(page, '.ciw-rec').click(); // starta ny
    await page.waitForTimeout(50); // låt den första sessionens onend köra
    await expect(q(page, '.ciw-rec')).toHaveClass(/recording/);
  });
});
