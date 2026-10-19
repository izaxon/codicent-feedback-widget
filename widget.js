/*!
 * Codicent Issue Widget — prototyp 0.4.0
 * Embedbar, vanilla JS (ES2017+), ingen byggkedja, inga beroenden.
 *
 * Skickar INTE till GitHub. Skickar ett meddelande till Codicent
 * som #issue-draft, för granskning/transform därifrån.
 *
 * Ingen endpoint eller API-nyckel är hårdkodad här — båda kommer
 * via config från host-appen (se README.md). Nyckeln är definierad/
 * registrerad i Codicent som ett data-meddelande taggat #api-key
 * (endast SHA-256-hash av värdet lagras där); widgeten får själva
 * nyckelvärdet enbart via hostens config.
 */
(function (global) {
  'use strict';

  if (typeof document === 'undefined') return;
  if (global.CodicentIssueWidget && global.CodicentIssueWidget.version) return; // redan laddad

  var VERSION = '0.4.0';
  var MAX_AUDIO_SECONDS = 120; // 2 min — backend ska också kontrollera detta
  var DEFAULT_MAX_BODY = 5000;                 // tecken — samma gräns som backend (se PROMPT-claude-max.md)
  var DEFAULT_MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB — samma gräns som backend
  var LOG = '[codicent-issue-widget] ';
  // Måste läsas medan skriptet körs; är null för async/dynamiskt laddade skript.
  var loaderScript = document.currentScript;

  // ---------------------------------------------------------------------------
  // TEXTER — alla strängar som visas för besökaren. Skriv över enskilda nycklar
  // med config.messages (t.ex. för en annan språkversion). {x} byts mot värden.
  // ---------------------------------------------------------------------------
  var MESSAGES = {
    openButton: 'Rapportera ett problem',
    dialogTitle: 'Rapportera ett problem',
    project: 'Projekt',
    titleLabel: 'Titel',
    optional: '(valfri)',
    titlePlaceholder: 'Kort sammanfattning',
    bodyLabel: 'Beskrivning',
    bodyPlaceholder: 'Vad är fel? Vad förväntade du dig?',
    draftHint: 'Sparas som utkast (#issue-draft) i Codicent och granskas innan det blir ett GitHub-issue.',
    audioLabel: 'Ljudinspelning',
    audioOptional: '(valfri, max 2 min)',
    record: '● Spela in ljud',
    recordAgain: '● Spela in igen',
    stopRecording: '⏹ Stoppa inspelning',
    audioNone: 'Inget ljud inspelat. Mikrofonen används först när du trycker på Spela in.',
    audioUnsupported: 'Ljudinspelning stöds inte i den här webbläsaren — skriv i stället (eller använd valfri röstifyllning nedan).',
    audioInsecure: 'Ljudinspelning kräver en säker anslutning (https) — skriv i stället.',
    micDenied: 'Mikrofonen nekades eller är inte tillgänglig. Du kan skriva beskrivningen i stället.',
    micDeniedStatus: 'Inget ljud spelades in — skriv i stället, det går lika bra.',
    recorderFailed: 'Kunde inte starta inspelningen i den här webbläsaren.',
    recorderError: 'Inspelningen avbröts av ett fel. Försök igen eller skriv i stället.',
    recording: 'Spelar in… {elapsed} / {max}',
    recordingDone: 'Inspelning klar ({elapsed} / {max}).',
    recordingEmpty: 'Ingen ljuddata spelades in. Försök igen.',
    attached: 'Bifogat ljud: {name} · {time} · {kb} KB — lyssna gärna innan du skickar.',
    audioDelete: 'Ta bort ljud / spela in igen',
    audioHint: 'Ljudet bifogas rapporten och sparas i Codicent, där det kan transkriberas senare. Det är ljudfilen som gäller — inte webbläsarens text.',
    speechStart: '🎙 Fyll i text med röst (valfritt)',
    speechStop: '⏹ Stoppa',
    speechHint: 'Valfri bekvämlighet: webbläsarens taligenkänning fyller i textfältet (ljudet kan skickas till webbläsarleverantörens tjänst, t.ex. Google i Chrome). Inte sanningskälla.',
    speechError: 'Röstinmatning misslyckades ({error}). Skriv i stället.',
    speechFailed: 'Kunde inte starta röstinmatning.',
    stopRecordingFirst: 'Stoppa ljudinspelningen först.',
    stopSpeechFirst: 'Stoppa röstifyllningen först.',
    stopBeforeSend: 'Stoppa inspelningen innan du skickar.',
    finalizing: 'Ljudet bearbetas — försök igen om ett ögonblick.',
    needInput: 'Skriv en beskrivning eller spela in ljud.',
    voiceReportTitle: 'Röstinspelad rapport',
    send: 'Skicka som utkast',
    cancel: 'Avbryt',
    sending: 'Skickar…',
    bodyCounter: '{n} / {max} tecken',
    audioTooLarge: 'Inspelningen är för stor ({mb} MB, max {max} MB). Spela in en kortare.',
    privacyNotice: 'Vi sparar din rapport, sidans adress och ett eventuellt ljud för att kunna felsöka. Skriv inga personuppgifter du inte vill dela.',
    privacyLink: 'Läs mer',
    errTimeout: 'Tidsgränsen överskreds — försök igen.',
    errNetwork: 'Nätverksfel — kontrollera anslutningen och försök igen.',
    errUnauthorized: 'Den här sidan får inte skicka rapporter (nyckel eller projekt nekades).',
    errTooLarge: 'Rapporten eller ljudet är för stort.',
    errRateLimited: 'För många rapporter just nu — försök igen om en stund.',
    errRejected: 'Rapporten avvisades (för lång eller ogiltig).',
    errServer: 'Servern svarade med ett fel — försök igen om en stund.',
    errHttp: 'Oväntat svar ({status}) från Codicent.',
    errBadResponse: 'Oväntat svar från Codicent (inget id).',
    sentDemo: 'Demo-läge: inget skickades. Meddelandet loggades i konsolen.',
    sentOk: 'Tack! Utkastet är sparat i Codicent (#issue-draft #{project}).',
    done: 'Stäng',
    another: 'Skicka en till',
    failed: 'Kunde inte skicka: {error}',
    notConfigured: 'Rapportering är inte konfigurerad (endpoint saknas)',
    draftRestored: 'Ditt tidigare, ej skickade utkast har återställts.'
  };

  var MESSAGES_EN = {
    openButton: 'Report a problem',
    dialogTitle: 'Report a problem',
    project: 'Project',
    titleLabel: 'Title',
    optional: '(optional)',
    titlePlaceholder: 'Short summary',
    bodyLabel: 'Description',
    bodyPlaceholder: 'What is wrong? What did you expect?',
    draftHint: 'Saved as a draft (#issue-draft) in Codicent and reviewed before it becomes a GitHub issue.',
    audioLabel: 'Voice recording',
    audioOptional: '(optional, max 2 min)',
    record: '● Record audio',
    recordAgain: '● Record again',
    stopRecording: '⏹ Stop recording',
    audioNone: 'No audio recorded. The microphone is only used when you press Record.',
    audioUnsupported: 'Audio recording is not supported in this browser — please type instead (or use the optional voice fill below).',
    audioInsecure: 'Audio recording requires a secure connection (https) — please type instead.',
    micDenied: 'The microphone was denied or is unavailable. You can type the description instead.',
    micDeniedStatus: 'No audio was recorded — typing works just as well.',
    recorderFailed: 'Could not start recording in this browser.',
    recorderError: 'The recording was interrupted by an error. Try again or type instead.',
    recording: 'Recording… {elapsed} / {max}',
    recordingDone: 'Recording done ({elapsed} / {max}).',
    recordingEmpty: 'No audio data was recorded. Try again.',
    attached: 'Attached audio: {name} · {time} · {kb} KB — please listen before sending.',
    audioDelete: 'Remove audio / record again',
    audioHint: 'The audio is attached to the report and stored in Codicent, where it can be transcribed later. The audio file is what counts — not the browser text.',
    speechStart: '🎙 Fill in text by voice (optional)',
    speechStop: '⏹ Stop',
    speechHint: 'Optional convenience: the browser speech recognition fills in the text field (audio may be sent to the browser vendor, e.g. Google in Chrome). Not a source of truth.',
    speechError: 'Voice input failed ({error}). Please type instead.',
    speechFailed: 'Could not start voice input.',
    stopRecordingFirst: 'Stop the audio recording first.',
    stopSpeechFirst: 'Stop the voice fill first.',
    stopBeforeSend: 'Stop the recording before sending.',
    finalizing: 'The audio is being processed — try again in a moment.',
    needInput: 'Write a description or record audio.',
    voiceReportTitle: 'Voice report',
    send: 'Send as draft',
    cancel: 'Cancel',
    sending: 'Sending…',
    bodyCounter: '{n} / {max} characters',
    audioTooLarge: 'The recording is too large ({mb} MB, max {max} MB). Record a shorter one.',
    privacyNotice: 'We store your report, the page address and any audio to be able to troubleshoot. Do not include personal data you do not want to share.',
    privacyLink: 'Read more',
    errTimeout: 'The request timed out — please try again.',
    errNetwork: 'Network error — check your connection and try again.',
    errUnauthorized: 'This page is not allowed to send reports (key or project was denied).',
    errTooLarge: 'The report or audio is too large.',
    errRateLimited: 'Too many reports right now — please try again in a while.',
    errRejected: 'The report was rejected (too long or invalid).',
    errServer: 'The server responded with an error — please try again in a while.',
    errHttp: 'Unexpected response ({status}) from Codicent.',
    errBadResponse: 'Unexpected response from Codicent (no id).',
    sentDemo: 'Demo mode: nothing was sent. The message was logged to the console.',
    sentOk: 'Thank you! The draft is saved in Codicent (#issue-draft #{project}).',
    done: 'Close',
    another: 'Send another',
    failed: 'Could not send: {error}',
    notConfigured: 'Reporting is not configured (endpoint missing)',
    draftRestored: 'Your earlier, unsent draft has been restored.'
  };
  var LANGS = { sv: MESSAGES, en: MESSAGES_EN };
  var SPEECH_LANGS = { sv: 'sv-SE', en: 'en-US' };

  function langOf(config) {
    var l = String(config.lang || 'sv').toLowerCase().split('-')[0];
    return LANGS[l] ? l : 'sv';
  }

  function format(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }

  // ---------------------------------------------------------------------------
  // ADAPTER — byt bara här (eller sätt config.send) när Codicent kopplar rätt API.
  //
  // Kontrakt: ta emot (payload, config, audio?), posta till config.endpoint med
  // config.apiKey i X-API-Key-headern, returnera Promise<{ ok, id, demo?, audio? }>.
  // Kasta Error (gärna med .status) vid fel — meddelandet visas för besökaren.
  //
  // Klienten skickar BARA strukturerad data: { project, payload }. Meddelandet
  // "#issue-draft #<projekt>\n\n<JSON>" och taggarna byggs av SERVERN från den
  // validerade payloaden — klienten kan alltså inte påverka vilka taggar ett
  // meddelande får. payload.client_id är en idempotensnyckel: samma id vid
  // omförsök, så servern kan svara med redan skapat utkast i stället för dubbletter.
  //
  // Med ljud: multipart/form-data med fälten project, payload (JSON-sträng) och
  // audio (filen); utan ljud: JSON. Servern validerar nyckeln mot
  // #api-key-meddelandet/-meddelandena i hostprojektet (hash-jämförelse, active,
  // expires_at, allowed_projects, endpoint — se README > "API-nyckel definieras
  // med #api-key i Codicent").
  //
  // Kandidater i Codicent (avgörs backend-sidan):
  //   a) befintligt #apidef / CodicentApiController-mönster (X-API-Key +
  //      SHA-256-hash, fast-tidsjämförelse)
  //   b) post_message / create_data_message
  // ---------------------------------------------------------------------------
  // audio (valfritt): { blob, filename, durationSec }
  function httpError(message, status) {
    var e = new Error(message);
    if (status) e.status = status;
    return e;
  }

  function statusMessage(status, M) {
    if (status === 401 || status === 403) return M.errUnauthorized;
    if (status === 413) return M.errTooLarge;
    if (status === 429) return M.errRateLimited;
    if (status === 400 || status === 422) return M.errRejected;
    if (status >= 500) return M.errServer;
    return format(M.errHttp, { status: status });
  }

  async function sendToCodicent(payload, config, audio) {
    var M = config.messages;
    // Bara för demo-logg/förhandsvisning — det riktiga meddelandet byggs av servern.
    var messageText = '#issue-draft #' + payload.project + '\n\n' + JSON.stringify(payload, null, 2);
    var audioMeta = audio ? {
      filename: audio.filename, size: audio.blob.size,
      mimeType: audio.blob.type || 'audio/webm', durationSec: audio.durationSec
    } : null;
    if (!config.endpoint) {
      // Demo-läge måste väljas uttryckligen. En saknad endpoint i produktion
      // (t.ex. misslyckad injicering av config) ska aldrig se ut som lyckat skick.
      if (config.demo !== true) throw new Error(M.notConfigured);
      console.info(LOG + 'DEMO — skulle ha skickat:\n' + messageText +
        (audioMeta ? '\n[ljud skulle bifogas som multipart-fält "audio": ' + audioMeta.filename + ', ' + audioMeta.size + ' byte]' : ''));
      return { ok: true, demo: true, messageText: messageText, audio: audioMeta };
    }
    var fetchOptions;
    if (audio && audio.blob) {
      var form = new FormData(); // sätt INTE Content-Type själv — webbläsaren sätter boundary
      form.append('project', payload.project);
      form.append('payload', JSON.stringify(payload));
      form.append('audio', audio.blob, audio.filename);
      fetchOptions = { method: 'POST', headers: { 'X-API-Key': config.apiKey || '' }, body: form };
    } else {
      fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Värdet för nyckeln registrerad med #api-key i Codicent (endast hash lagras där).
          'X-API-Key': config.apiKey || ''
        },
        body: JSON.stringify({ project: payload.project, payload: payload })
      };
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 30000;
    var timer = null;
    if (controller) {
      fetchOptions.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    }
    try {
      var response;
      try {
        response = await fetch(config.endpoint, fetchOptions);
      } catch (e) {
        throw httpError(e && e.name === 'AbortError' ? M.errTimeout : M.errNetwork);
      }
      if (!response.ok) throw httpError(statusMessage(response.status, M), response.status);
      var data = null;
      try { data = await response.json(); }
      catch (e) { if (e && e.name === 'AbortError') throw httpError(M.errTimeout); /* annars: hanteras nedan */ }
      // En 2xx utan JSON-id är inte ett sparat utkast (t.ex. en proxy- eller SPA-sida som svarar 200).
      var id = data && (data.id || data.messageId);
      if (!id) throw httpError(M.errBadResponse, response.status);
      return { ok: true, id: id, messageText: messageText, audio: audioMeta };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  // ------------------------- slut ADAPTER ------------------------------------

  function normalizeProjects(config) {
    var list = config.projects || config.project || '';
    if (typeof list === 'string') list = list.split(',');
    return list.map(function (p) { return String(p).trim().replace(/^#/, ''); }).filter(Boolean);
  }

  // Tar bort undefined/null/tomma strängar så att ett tomt värde aldrig skriver över ett satt.
  function prune(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v !== undefined && v !== null && v !== '') out[k] = v;
    });
    return out;
  }

  function readDataset(el) {
    var d = (el && el.dataset) || {};
    return prune({
      project: d.project || d.codicentProject,
      projects: d.projects,
      endpoint: d.endpoint,
      apiKey: d.apiKey, // nyckelvärdet injiceras av hosten; registrerat med #api-key i Codicent, se README
      buttonText: d.buttonText,
      allowProjectSwitch: d.allowProjectSwitch === undefined ? undefined : d.allowProjectSwitch === 'true',
      demo: d.demo === undefined ? undefined : d.demo === 'true',
      timeoutMs: d.timeoutMs,
      lang: d.lang,
      speechLang: d.speechLang,
      pageUrl: d.pageUrl,
      includeUserAgent: d.includeUserAgent === undefined ? undefined : d.includeUserAgent === 'true',
      privacyUrl: d.privacyUrl,
      maxBodyLength: d.maxBodyLength,
      maxAudioBytes: d.maxAudioBytes
    });
  }

  // Standardvärden från <script src="widget.js" data-…>. Skapar ingen widget själv.
  function parseScriptConfig() {
    return loaderScript ? readDataset(loaderScript) : {};
  }

  // CSS-variablerna har bara fallback-värden (inget `:host{--ciw-…}`), så att de
  // går att sätta på valfri förfader till widgeten — inte bara på mount-elementet.
  var STYLES = [
    ':host{font-family:var(--ciw-font,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--ciw-text,#111827)}',
    '*{box-sizing:border-box}[hidden]{display:none!important}',
    '.ciw-btn{background:var(--ciw-button-bg,var(--ciw-accent,#2563eb));color:var(--ciw-button-text,#fff);border:0;',
    'border-radius:var(--ciw-radius,12px);padding:.55rem 1rem;font:inherit;cursor:pointer}',
    '.ciw-btn[disabled]{opacity:.6;cursor:wait}',
    '.ciw-btn-secondary{background:transparent;color:var(--ciw-text,#111827);border:1px solid var(--ciw-border,#d1d5db)}',
    '.ciw-btn:focus-visible,.ciw-field input:focus-visible,.ciw-field textarea:focus-visible,.ciw-field select:focus-visible{',
    'outline:2px solid var(--ciw-accent,#2563eb);outline-offset:2px}',
    '.ciw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:2147483000}',
    '@media(min-width:640px){.ciw-overlay{align-items:center}}',
    '.ciw-panel{background:var(--ciw-panel-bg,#fff);color:var(--ciw-text,#111827);width:min(520px,100%);max-height:92vh;max-height:92dvh;overflow:auto;',
    // Pill-radie (999px) på knappar är avsiktligt, men panelen får aldrig bli en oval som klipper innehållet.
    'border-radius:min(var(--ciw-radius,12px),24px);padding:1rem 1.25rem 1.25rem;box-shadow:0 20px 50px rgba(0,0,0,.25)}',
    '.ciw-panel h2{margin:.2rem 0 .75rem;font-size:1.1rem}',
    '.ciw-field{margin:.75rem 0}.ciw-field label,.ciw-label{display:block;font-weight:600;margin-bottom:.3rem;font-size:.9rem}',
    '.ciw-field input,.ciw-field textarea,.ciw-field select{width:100%;padding:.55rem;border:1px solid var(--ciw-border,#d1d5db);',
    'border-radius:min(calc(var(--ciw-radius,12px) * .66),16px);font:inherit;background:var(--ciw-bg,var(--ciw-panel-bg,#fff));color:var(--ciw-text,#111827)}',
    '.ciw-field textarea{min-height:120px;resize:vertical}',
    '.ciw-hint{color:var(--ciw-muted,#6b7280);font-size:.82rem;margin-top:.25rem}',
    '.ciw-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem}',
    '.ciw-status{margin-top:.75rem;font-size:.9rem}.ciw-status.ok{color:#15803d}.ciw-status.err{color:#b91c1c}',
    '.ciw-rec.recording,.ciw-record.recording{background:#b91c1c;color:#fff;border-color:#b91c1c}',
    '.ciw-audio{margin-top:.5rem}.ciw-audio audio{width:100%;margin:.35rem 0}',
    '.ciw-audio-name{font-size:.85rem;color:var(--ciw-muted,#6b7280);word-break:break-all}',
    '.ciw-done p{margin:.5rem 0}'
  ].join('');

  var instances = new WeakMap(); // mount-element -> widget (init är idempotent per element)
  var scrollLocks = 0, scrollPrev = '';
  function lockScroll() {
    if (scrollLocks++ === 0) { scrollPrev = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  }
  function unlockScroll() {
    if (scrollLocks > 0 && --scrollLocks === 0) document.body.style.overflow = scrollPrev;
  }

  function createWidget(userConfig) {
    var config = Object.assign({}, parseScriptConfig(), prune(userConfig));
    var lang = langOf(config);
    config.messages = Object.assign({}, LANGS[lang], userConfig && userConfig.messages);
    var speechLang = config.speechLang || SPEECH_LANGS[lang];
    var maxBody = Number(config.maxBodyLength) > 0 ? Number(config.maxBodyLength) : DEFAULT_MAX_BODY;
    var maxAudioBytes = Number(config.maxAudioBytes) > 0 ? Number(config.maxAudioBytes) : DEFAULT_MAX_AUDIO_BYTES;
    var T = function (key, vars) { return format(config.messages[key] !== undefined ? config.messages[key] : key, vars); };
    var projects = normalizeProjects(config);
    if (!projects.length) {
      console.error(LOG + 'Inget projekt angivet (project / projects / data-project) — widgeten startades inte.');
      return null;
    }

    var host = null;
    if (config.mount) {
      host = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
      if (!host) console.warn(LOG + 'mount "' + config.mount + '" hittades inte — monterar sist på sidan.');
    }
    if (host && instances.has(host)) return instances.get(host);
    var autoCreated = false;
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-codicent-issue-widget-instance', '');
      document.body.appendChild(host);
      autoCreated = true;
    }
    if (!host.attachShadow) {
      console.error(LOG + 'Webbläsaren saknar Shadow DOM — widgeten startades inte.');
      return null;
    }
    // Egen skal-div: mount-elementets barn och dess eventuella shadow-root rörs inte.
    var shell = document.createElement('div');
    host.appendChild(shell);
    var root = shell.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = STYLES;
    root.appendChild(style);

    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'ciw-btn ciw-open';
    openBtn.textContent = config.buttonText || T('openButton');
    root.appendChild(openBtn);

    if (!config.endpoint && config.demo !== true) {
      console.error(LOG + 'Ingen endpoint konfigurerad. Sätt endpoint, eller demo: true för att prova utan nätverk.');
    }

    var overlay = null;
    var disposeOverlay = null;
    var draft = null; // { project, title, body, audio } — överlever stäng/öppna tills det skickats
    var clientId = null; // idempotensnyckel: samma id vid omförsök av samma rapport, nytt efter lyckat skick
    var destroyed = false;

    function close(discard) {
      if (!overlay) return;
      if (disposeOverlay) { try { disposeOverlay(discard === true); } catch (e) { /* ignore */ } disposeOverlay = null; }
      overlay.remove(); overlay = null;
      unlockScroll();
      if (!destroyed) openBtn.focus();
    }

    function privacyHtml() {
      var notice = T('privacyNotice');
      if (!notice) return '';
      var url = String(config.privacyUrl || '');
      var link = /^(https?:\/\/|\/(?!\/))/i.test(url)
        ? ' <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(T('privacyLink')) + '</a>' : '';
      return '<div class="ciw-hint ciw-privacy">' + escapeHtml(notice) + link + '</div>';
    }

    function open() {
      if (overlay || destroyed) return;
      overlay = document.createElement('div');
      overlay.className = 'ciw-overlay';
      var projectField = '';
      if (projects.length > 1 && config.allowProjectSwitch === true) {
        var options = projects.map(function (p) {
          return '<option value="' + escapeHtml(p) + '"' + (p === projects[0] ? ' selected' : '') + '>#' + escapeHtml(p) + '</option>';
        }).join('');
        projectField = '<div class="ciw-field"><label for="ciw-project">' + escapeHtml(T('project')) + '</label><select id="ciw-project">' + options + '</select></div>';
      } else {
        projectField = '<div class="ciw-field"><div class="ciw-label" id="ciw-project-label">' + escapeHtml(T('project')) + '</div>' +
          '<div aria-labelledby="ciw-project-label">#' + escapeHtml(projects[0]) + '</div>' +
          '<input type="hidden" id="ciw-project" value="' + escapeHtml(projects[0]) + '"></div>';
      }

      overlay.innerHTML =
        '<div class="ciw-panel" role="dialog" aria-modal="true" aria-labelledby="ciw-title">' +
        '<h2 id="ciw-title">' + escapeHtml(T('dialogTitle')) + '</h2>' +
        '<div class="ciw-form">' +
        projectField +
        '<div class="ciw-field"><label for="ciw-title-input">' + escapeHtml(T('titleLabel')) + ' <span class="ciw-hint">' + escapeHtml(T('optional')) + '</span></label>' +
        '<input id="ciw-title-input" type="text" maxlength="200" placeholder="' + escapeHtml(T('titlePlaceholder')) + '"></div>' +
        '<div class="ciw-field"><label for="ciw-body">' + escapeHtml(T('bodyLabel')) + '</label>' +
        '<textarea id="ciw-body" maxlength="' + maxBody + '" placeholder="' + escapeHtml(T('bodyPlaceholder')) + '"></textarea>' +
        '<div class="ciw-hint ciw-counter" aria-hidden="true"></div>' +
        '<div class="ciw-hint">' + escapeHtml(T('draftHint')) + '</div></div>' +
        '<div class="ciw-field" role="group" aria-labelledby="ciw-audio-label"><div class="ciw-label" id="ciw-audio-label">' + escapeHtml(T('audioLabel')) + ' <span class="ciw-hint">' + escapeHtml(T('audioOptional')) + '</span></div>' +
        '<div class="ciw-row" style="margin-top:0">' +
        '<button type="button" class="ciw-btn ciw-btn-secondary ciw-record">' + escapeHtml(T('record')) + '</button>' +
        '<span class="ciw-hint ciw-audio-status"></span></div>' +
        '<div class="ciw-audio" hidden><audio class="ciw-audio-preview" controls></audio>' +
        '<div class="ciw-audio-name"></div>' +
        '<div class="ciw-row"><button type="button" class="ciw-btn ciw-btn-secondary ciw-audio-delete">' + escapeHtml(T('audioDelete')) + '</button></div></div>' +
        '<div class="ciw-hint">' + escapeHtml(T('audioHint')) + '</div></div>' +
        '<div class="ciw-row ciw-speech-row" hidden>' +
        '<button type="button" class="ciw-btn ciw-rec">' + escapeHtml(T('speechStart')) + '</button>' +
        '<span class="ciw-hint">' + escapeHtml(T('speechHint')) + '</span></div>' +
        privacyHtml() +
        '<div class="ciw-row"><button type="button" class="ciw-btn ciw-send">' + escapeHtml(T('send')) + '</button>' +
        '<button type="button" class="ciw-btn ciw-btn-secondary ciw-cancel">' + escapeHtml(T('cancel')) + '</button></div>' +
        '<div class="ciw-status" role="status" aria-live="polite"></div></div>' +
        '<div class="ciw-done" hidden><p class="ciw-done-text" role="status"></p>' +
        '<div class="ciw-row"><button type="button" class="ciw-btn ciw-another">' + escapeHtml(T('another')) + '</button>' +
        '<button type="button" class="ciw-btn ciw-btn-secondary ciw-close">' + escapeHtml(T('done')) + '</button></div></div></div>';

      root.appendChild(overlay);
      lockScroll();
      var thisOverlay = overlay;
      var disposed = false;
      var panel = overlay.querySelector('.ciw-panel');
      var formEl = overlay.querySelector('.ciw-form');
      var doneEl = overlay.querySelector('.ciw-done');
      var projectEl = overlay.querySelector('#ciw-project');
      var titleEl = overlay.querySelector('#ciw-title-input');
      var bodyEl = overlay.querySelector('#ciw-body');
      var statusEl = overlay.querySelector('.ciw-status');
      var sendBtn = overlay.querySelector('.ciw-send');
      var sent = false;
      var counterEl = overlay.querySelector('.ciw-counter');
      function updateCounter() { counterEl.textContent = T('bodyCounter', { n: bodyEl.value.length, max: maxBody }); }
      bodyEl.addEventListener('input', updateCounter);
      updateCounter();

      function setStatus(text, ok) {
        statusEl.textContent = text;
        statusEl.className = 'ciw-status ' + (ok ? 'ok' : 'err');
      }

      // --- Stäng: bakgrund (bara om både tryck och släpp skedde där), Escape, Avbryt ---
      var downOnBackdrop = false;
      overlay.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === thisOverlay; });
      overlay.addEventListener('click', function (e) {
        if (e.target === thisOverlay && downOnBackdrop) close(); // bevarar utkastet
        downOnBackdrop = false;
      });
      overlay.querySelector('.ciw-cancel').addEventListener('click', function () { close(true); });
      overlay.querySelector('.ciw-close').addEventListener('click', function () { close(true); });

      function focusables() {
        return Array.prototype.filter.call(
          panel.querySelectorAll('button,input:not([type=hidden]),textarea,select,audio[controls]'),
          function (el) { return !el.disabled && el.getClientRects().length > 0; }
        );
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
        if (e.key !== 'Tab') return;
        var list = focusables();
        if (!list.length) return;
        var active = root.activeElement;
        var idx = list.indexOf(active);
        if (e.shiftKey && (idx <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && (idx === -1 || idx === list.length - 1)) { e.preventDefault(); list[0].focus(); }
      }
      document.addEventListener('keydown', onKey, true);

      // --- Ljudinspelning: MediaRecorder (sanningskällan är ljudfilen) ---
      var mediaRecorder = null, mediaStream = null, audioChunks = [];
      var audioBlob = null, audioUrl = null, audioFilename = '', audioDurationSec = 0;
      var recordTimer = null, hardStopTimer = null, recordStartedAt = 0, recordStoppedAt = 0;
      var requestingMic = false, finalizing = false;
      var recognition = null;
      var recordBtn = overlay.querySelector('.ciw-record');
      var audioStatus = overlay.querySelector('.ciw-audio-status');
      var audioBox = overlay.querySelector('.ciw-audio');
      var audioPreview = overlay.querySelector('.ciw-audio-preview');
      var audioName = overlay.querySelector('.ciw-audio-name');
      var maxLabel = fmtTime(MAX_AUDIO_SECONDS);

      function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
      }
      function isRecording() { return !!(mediaRecorder && mediaRecorder.state === 'recording'); }
      function stopTracks() {
        if (mediaStream) { mediaStream.getTracks().forEach(function (t) { t.stop(); }); mediaStream = null; }
      }
      function clearTimers() {
        if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
        if (hardStopTimer) { clearTimeout(hardStopTimer); hardStopTimer = null; }
      }
      function revokeAudioUrl() {
        if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) { /* ignore */ } audioUrl = null; }
      }
      function showAudio() {
        revokeAudioUrl();
        audioUrl = URL.createObjectURL(audioBlob);
        audioPreview.src = audioUrl;
        audioName.textContent = T('attached', { name: audioFilename, time: fmtTime(audioDurationSec), kb: Math.round(audioBlob.size / 1024) });
        audioBox.hidden = false;
        audioStatus.textContent = T('recordingDone', { elapsed: fmtTime(audioDurationSec), max: maxLabel });
        recordBtn.textContent = T('recordAgain');
      }
      function clearAudio() {
        revokeAudioUrl();
        audioBlob = null; audioFilename = ''; audioDurationSec = 0; audioChunks = [];
        audioPreview.removeAttribute('src'); audioBox.hidden = true;
        audioStatus.textContent = T('audioNone');
        recordBtn.textContent = T('record'); recordBtn.classList.remove('recording');
      }
      function stopRecording() {
        clearTimers();
        if (isRecording()) {
          finalizing = true; // onstop levereras asynkront — blobben finns först då
          recordStoppedAt = Date.now();
          try { mediaRecorder.stop(); } catch (e) { finalizing = false; }
        }
        recordBtn.classList.remove('recording');
        recordBtn.textContent = audioBlob ? T('recordAgain') : T('record');
      }
      overlay.querySelector('.ciw-audio-delete').addEventListener('click', clearAudio);

      clearAudio();
      if (!global.MediaRecorder || !(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        recordBtn.disabled = true;
        audioStatus.textContent = global.isSecureContext === false ? T('audioInsecure') : T('audioUnsupported');
      } else {
        recordBtn.addEventListener('click', async function () {
          if (isRecording()) { stopRecording(); return; }
          if (requestingMic || finalizing) return;
          if (recognition) { setStatus(T('stopSpeechFirst'), false); return; }
          requestingMic = true;
          var stream;
          try {
            // Mikrofonbehörighet begärs FÖRST här, vid knapptryck.
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e) {
            requestingMic = false;
            if (disposed) return;
            audioStatus.textContent = T('micDenied');
            setStatus(T('micDeniedStatus'), false);
            return;
          }
          requestingMic = false;
          if (disposed) { stream.getTracks().forEach(function (t) { t.stop(); }); return; } // dialogen stängdes under behörighetsfrågan
          var rec;
          try { rec = new MediaRecorder(stream); }
          catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); audioStatus.textContent = T('recorderFailed'); return; }
          // Först nu, när en ny inspelning faktiskt startar, ersätts den gamla.
          clearAudio();
          mediaStream = stream; mediaRecorder = rec; audioChunks = [];
          rec.ondataavailable = function (e) { if (e.data && e.data.size) audioChunks.push(e.data); };
          rec.onerror = function () {
            clearTimers(); stopTracks(); finalizing = false;
            if (!disposed) { audioStatus.textContent = T('recorderError'); recordBtn.textContent = T('record'); recordBtn.classList.remove('recording'); }
          };
          rec.onstop = function () {
            clearTimers(); stopTracks(); finalizing = false;
            if (disposed || mediaRecorder !== rec) return;
            if (!audioChunks.length) { audioStatus.textContent = T('recordingEmpty'); recordBtn.textContent = T('record'); return; }
            // Utan codecs-parametern ("audio/webm;codecs=opus" -> "audio/webm"): enklare att tillåtlista på servern.
            var mime = String(rec.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
            audioBlob = new Blob(audioChunks, { type: mime });
            if (audioBlob.size > maxAudioBytes) {
              var tooBig = audioBlob.size;
              audioBlob = null; audioChunks = [];
              audioStatus.textContent = T('audioTooLarge', { mb: (tooBig / 1048576).toFixed(1), max: (maxAudioBytes / 1048576).toFixed(0) });
              recordBtn.textContent = T('record');
              return;
            }
            var ext = mime.indexOf('ogg') >= 0 ? 'ogg' : (mime.indexOf('mp4') >= 0 || mime.indexOf('m4a') >= 0 ? 'm4a' : 'webm');
            audioFilename = 'issue-voice-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
            audioDurationSec = Math.max(1, Math.round((recordStoppedAt - recordStartedAt) / 1000));
            showAudio();
          };
          recordStartedAt = Date.now();
          rec.start();
          recordBtn.textContent = T('stopRecording'); recordBtn.classList.add('recording');
          audioStatus.textContent = T('recording', { elapsed: '0:00', max: maxLabel });
          recordTimer = setInterval(function () {
            audioStatus.textContent = T('recording', { elapsed: fmtTime((Date.now() - recordStartedAt) / 1000), max: maxLabel });
          }, 250);
          // Hård gräns 2 min — egen timer, så att gränsen inte hänger på UI-intervallet.
          hardStopTimer = setTimeout(stopRecording, MAX_AUDIO_SECONDS * 1000);
        });
      }

      // Röstifyllning: Web Speech API, sv-SE, när det stöds.
      var SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
      var recBtn = overlay.querySelector('.ciw-rec');
      function resetRecUi() { recBtn.classList.remove('recording'); recBtn.textContent = T('speechStart'); }
      function stopVoice() {
        if (recognition) { var r = recognition; recognition = null; try { r.stop(); } catch (e) { /* ignore */ } }
        resetRecUi();
      }
      if (SpeechRecognition) {
        overlay.querySelector('.ciw-speech-row').hidden = false;
        recBtn.addEventListener('click', function () {
          if (recognition) { stopVoice(); return; }
          if (isRecording() || requestingMic) { setStatus(T('stopRecordingFirst'), false); return; }
          var r = new SpeechRecognition();
          r.lang = speechLang;
          r.interimResults = true;
          r.continuous = false;
          var base = bodyEl.value ? bodyEl.value.replace(/\s+$/, '') + ' ' : '';
          // Alla callbacks ignoreras om r inte längre är den aktiva — annars kan sena
          // resultat skriva in text efter skick/stängning eller nolla en nystartad session.
          r.onresult = function (event) {
            if (recognition !== r) return;
            var text = '';
            for (var i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
            bodyEl.value = (base + text).slice(0, maxBody); updateCounter();
          };
          r.onerror = function (event) {
            if (recognition !== r) return;
            recognition = null; resetRecUi();
            setStatus(T('speechError', { error: event.error }), false);
          };
          r.onend = function () { if (recognition === r) { recognition = null; resetRecUi(); } };
          recognition = r;
          try { r.start(); recBtn.classList.add('recording'); recBtn.textContent = T('speechStop'); }
          catch (e) { recognition = null; resetRecUi(); setStatus(T('speechFailed'), false); }
        });
      }

      // --- Återställ ej skickat utkast ---
      if (draft) {
        if (projectEl.tagName === 'SELECT' && Array.prototype.some.call(projectEl.options, function (o) { return o.value === draft.project; })) projectEl.value = draft.project;
        titleEl.value = draft.title; bodyEl.value = draft.body; updateCounter();
        if (draft.audio) {
          audioBlob = draft.audio.blob; audioFilename = draft.audio.filename; audioDurationSec = draft.audio.durationSec;
          showAudio();
        }
        setStatus(T('draftRestored'), true);
      }

      // Körs vid varje stängning: släpp mikrofon, tala, lyssnare och blob-URL:er.
      disposeOverlay = function (discard) {
        disposed = true;
        document.removeEventListener('keydown', onKey, true);
        stopVoice();
        clearTimers();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch (e) { /* ignore */ } }
        stopTracks();
        revokeAudioUrl();
        if (discard || sent) { draft = null; if (discard) clientId = null; return; }
        var hasContent = titleEl.value.trim() || bodyEl.value.trim() || audioBlob;
        draft = hasContent ? {
          project: projectEl.value, title: titleEl.value, body: bodyEl.value,
          audio: audioBlob ? { blob: audioBlob, filename: audioFilename, durationSec: audioDurationSec } : null
        } : null;
      };

      function resetForm() {
        titleEl.value = ''; bodyEl.value = ''; updateCounter(); clearAudio(); statusEl.textContent = '';
      }
      overlay.querySelector('.ciw-another').addEventListener('click', function () {
        sent = false; doneEl.hidden = true; formEl.hidden = false; resetForm(); titleEl.focus();
      });

      sendBtn.addEventListener('click', async function () {
        if (sendBtn.disabled) return;
        if (isRecording()) { setStatus(T('stopBeforeSend'), false); return; }
        if (finalizing || requestingMic) { setStatus(T('finalizing'), false); return; }
        stopVoice(); // ingen sen taligenkänning ska skriva in text efter skick
        var audio = audioBlob ? { blob: audioBlob, filename: audioFilename, durationSec: audioDurationSec } : null;
        var payload = {
          client_id: clientId || (clientId = newClientId()),
          project: String(projectEl.value || projects[0]).replace(/^#/, ''),
          title: titleEl.value.trim(),
          body: bodyEl.value.trim(),
          client_created_at: new Date().toISOString(), // klientens klocka — servern sätter den riktiga tidsstämpeln
          source: 'issue-widget/' + VERSION,
          audio: audio ? { attached: true, filename: audioFilename, mime_type: audioBlob.type || 'audio/webm', duration_sec: audioDurationSec, size_bytes: audioBlob.size } : null
        };
        var pageUrl = pageUrlFor(config);
        if (pageUrl) payload.page_url = pageUrl;
        if (config.includeUserAgent === true && global.navigator) payload.user_agent = global.navigator.userAgent;
        if (payload.body.length > maxBody) { setStatus(T('errRejected'), false); return; }
        if (!payload.body && !audio) { setStatus(T('needInput'), false); bodyEl.focus(); return; }
        if (!payload.title) payload.title = payload.body ? titleFromBody(payload.body) : T('voiceReportTitle');

        sendBtn.disabled = true;
        setStatus(T('sending'), true);
        try {
          var result = await (typeof config.send === 'function' ? config.send : sendToCodicent)(payload, config, audio);
          sent = true; draft = null; clientId = null; // gäller även om dialogen hunnit stängas under skicket
          host.dispatchEvent(new CustomEvent('codicent-issue:submitted', { bubbles: true, detail: { payload: payload, result: result } }));
          if (!disposed) {
            overlay.querySelector('.ciw-done-text').textContent = result.demo ? T('sentDemo') : T('sentOk', { project: payload.project });
            formEl.hidden = true; doneEl.hidden = false;
            resetForm();
            overlay.querySelector('.ciw-another').focus();
          }
        } catch (err) {
          var message = err && err.name === 'AbortError' ? T('errTimeout') : (err && err.message) || String(err);
          host.dispatchEvent(new CustomEvent('codicent-issue:error', { bubbles: true, detail: { error: String(err), payload: payload } }));
          if (!disposed) setStatus(T('failed', { error: message }), false);
        } finally { if (!disposed) sendBtn.disabled = false; }
      });

      titleEl.focus();
    }

    openBtn.addEventListener('click', open);

    var widget = {
      open: open,
      close: function () { close(); },
      destroy: function () {
        if (destroyed) return;
        close(true);
        destroyed = true;
        instances.delete(host);
        if (autoCreated) host.remove(); else shell.remove();
      },
      version: VERSION,
      config: config
    };
    instances.set(host, widget);
    return widget;
  }

  function newClientId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // 'path' (standard): adress utan query/hash, som kan innehålla tokens eller personuppgifter.
  function pageUrlFor(config) {
    var mode = config.pageUrl || 'path';
    if (mode === 'none' || !global.location) return '';
    var href = String(global.location.href);
    return mode === 'full' ? href : href.split(/[?#]/)[0];
  }

  function titleFromBody(body) {
    var chars = Array.from(body); // kodpunkter, så att emoji inte klipps mitt i
    return chars.length > 80 ? chars.slice(0, 80).join('').replace(/\s+$/, '') + '…' : body;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Auto-init: element <div data-codicent-issue-widget ...></div>
  function autoInit() {
    document.querySelectorAll('[data-codicent-issue-widget]').forEach(function (el) {
      try { createWidget(Object.assign(readDataset(el), { mount: el })); }
      catch (e) { console.error(LOG + 'Kunde inte starta widgeten:', e); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

  global.CodicentIssueWidget = { init: createWidget, version: VERSION, _sendToCodicent: sendToCodicent };
})(typeof window !== 'undefined' ? window : globalThis);
