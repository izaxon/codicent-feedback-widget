/*!
 * Codicent Issue Widget — prototyp 0.2.0
 * Embedbar, vanilla JS, ingen byggkedja, inga beroenden.
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

  var VERSION = '0.2.0';
  var MAX_AUDIO_SECONDS = 120; // 2 min — backend ska också kontrollera detta
  var SPEECH_LANG = 'sv-SE';

  // ---------------------------------------------------------------------------
  // ADAPTER — byt bara här när Codicent kopplar rätt API.
  //
  // Kontrakt: ta emot (payload, config, audio?), posta till config.endpoint med
  // config.apiKey i X-API-Key-headern, returnera Promise<{ ok, id?, demo?, audio? }>.
  // Med ljud: multipart/form-data (fält 'audio'); utan ljud: JSON.
  // Servern validerar nyckeln mot #api-key-meddelandet/-meddelandena i
  // hostprojektet i Codicent (hash-jämförelse, active, expires_at,
  // allowed_projects, endpoint — se README > "API-nyckel definieras
  // med #api-key i Codicent").
  //
  // Kandidater i Codicent (avgörs backend-sidan, widgeten ändras inte mer
  // än i den här funktionen):
  //   a) befintligt #apidef / CodicentApiController-mönster (X-API-Key +
  //      SHA-256-hash, fast-tidsjämförelse)
  //   b) post_message / create_data_message med texten nedan
  // Meddelandetexten är alltid: "#issue-draft #<projekt>\n\n<JSON>"
  // ---------------------------------------------------------------------------
  // audio (valfritt): { blob, filename, durationSec }
  // Primärt format med ljud: multipart/form-data, fält 'audio'
  // (filnamn issue-voice-<timestamp>.webm). Adapter-ansvar: Codicent-
  // backend bifogar ljudet till #issue-draft-meddelandet och transkriberar
  // server-side senare; originaljudet behålls. Utan ljud: JSON som förut.
  async function sendToCodicent(payload, config, audio) {
    var messageText =
      '#issue-draft #' + payload.project + '\n\n' + JSON.stringify(payload, null, 2);
    var audioMeta = audio ? {
      filename: audio.filename, size: audio.blob.size,
      mimeType: audio.blob.type || 'audio/webm', durationSec: audio.durationSec
    } : null;
    if (!config.endpoint) {
      console.info('[codicent-issue-widget] DEMO — skulle ha skickat:\n' + messageText +
        (audioMeta ? '\n[ljud skulle bifogas som multipart-fält "audio": ' + audioMeta.filename + ', ' + audioMeta.size + ' byte]' : ''));
      return { ok: true, demo: true, messageText: messageText, audio: audioMeta };
    }
    var fetchOptions;
    if (audio && audio.blob) {
      var form = new FormData(); // sätt INTE Content-Type själv — webbläsaren sätter boundary
      form.append('project', payload.project);
      form.append('tags', JSON.stringify(['issue-draft', payload.project]));
      form.append('text', messageText);
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
        body: JSON.stringify({ project: payload.project, tags: ['issue-draft', payload.project], text: messageText, payload: payload })
      };
    }
    var response = await fetch(config.endpoint, fetchOptions);
    if (!response.ok) throw new Error('Codicent svarade ' + response.status);
    var data = null;
    try { data = await response.json(); } catch (e) { /* tomt svar är ok */ }
    return { ok: true, id: data && (data.id || data.messageId), messageText: messageText, audio: audioMeta };
  }
  // ------------------------- slut ADAPTER ------------------------------------

  function normalizeProjects(config) {
    var list = config.projects || config.project || '';
    if (typeof list === 'string') list = list.split(',');
    return list.map(function (p) { return String(p).trim().replace(/^#/, ''); }).filter(Boolean);
  }

  function parseScriptConfig() {
    var script = document.currentScript;
    if (!script) {
      var scripts = document.querySelectorAll('script[data-project],script[data-codicent-project]');
      script = scripts[scripts.length - 1];
    }
    if (!script) return {};
    var d = script.dataset || {};
    return {
      project: d.project || d.codicentProject || '',
      projects: d.projects || '',
      endpoint: d.endpoint || '',
      apiKey: d.apiKey || '', // nyckelvärdet injiceras av hosten; registrerat med #api-key i Codicent, se README
      mount: d.mount || '',
      buttonText: d.buttonText || '',
      allowProjectSwitch: d.allowProjectSwitch === 'true'
    };
  }

  var STYLES = [
    ':host{--ciw-accent:#2563eb;--ciw-bg:#fff;--ciw-panel-bg:#fff;--ciw-text:#111827;--ciw-muted:#6b7280;',
    '--ciw-border:#d1d5db;--ciw-radius:12px;--ciw-font:system-ui,-apple-system,"Segoe UI",sans-serif;',
    '--ciw-button-bg:var(--ciw-accent);--ciw-button-text:#fff;font-family:var(--ciw-font);color:var(--ciw-text)}',
    '*{box-sizing:border-box}',
    '.ciw-btn{background:var(--ciw-button-bg);color:var(--ciw-button-text);border:0;border-radius:var(--ciw-radius);',
    'padding:.55rem 1rem;font:inherit;cursor:pointer}',
    '.ciw-btn[disabled]{opacity:.6;cursor:wait}',
    '.ciw-btn-secondary{background:transparent;color:var(--ciw-text);border:1px solid var(--ciw-border)}',
    '.ciw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9999}',
    '@media(min-width:640px){.ciw-overlay{align-items:center}}',
    '.ciw-panel{background:var(--ciw-panel-bg);width:min(520px,100%);max-height:92vh;overflow:auto;',
    'border-radius:var(--ciw-radius);padding:1rem 1.25rem 1.25rem;box-shadow:0 20px 50px rgba(0,0,0,.25)}',
    '.ciw-panel h2{margin:.2rem 0 .75rem;font-size:1.1rem}',
    '.ciw-field{margin:.75rem 0}.ciw-field label{display:block;font-weight:600;margin-bottom:.3rem;font-size:.9rem}',
    '.ciw-field input,.ciw-field textarea,.ciw-field select{width:100%;padding:.55rem;border:1px solid var(--ciw-border);',
    'border-radius:calc(var(--ciw-radius) * .66);font:inherit;background:var(--ciw-bg);color:var(--ciw-text)}',
    '.ciw-field textarea{min-height:120px;resize:vertical}',
    '.ciw-hint{color:var(--ciw-muted);font-size:.82rem;margin-top:.25rem}',
    '.ciw-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem}',
    '.ciw-status{margin-top:.75rem;font-size:.9rem}.ciw-status.ok{color:#15803d}.ciw-status.err{color:#b91c1c}',
    '.ciw-rec.recording,.ciw-record.recording{background:#b91c1c;color:#fff;border-color:#b91c1c}',
    '.ciw-audio{margin-top:.5rem}.ciw-audio audio{width:100%;margin:.35rem 0}',
    '.ciw-audio-name{font-size:.85rem;color:var(--ciw-muted);word-break:break-all}'
  ].join('');

  function createWidget(userConfig) {
    var scriptConfig = parseScriptConfig();
    var config = Object.assign({}, scriptConfig, userConfig || {});
    var projects = normalizeProjects(config);
    if (!projects.length) projects = ['nextphase'];

    var host = null;
    if (config.mount) host = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-codicent-issue-widget-instance', '');
      document.body.appendChild(host);
    }
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var style = document.createElement('style');
    style.textContent = STYLES;
    root.appendChild(style);

    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'ciw-btn ciw-open';
    openBtn.textContent = config.buttonText || 'Rapportera ett problem';
    root.appendChild(openBtn);

    var overlay = null;
    var recognition = null;
    var overlayCleanup = null;
    var lastSubmitAt = 0;

    function close() {
      if (overlayCleanup) { try { overlayCleanup(); } catch (e) {} overlayCleanup = null; }
      stopVoice();
      if (overlay) { overlay.remove(); overlay = null; }
      openBtn.focus();
    }

    function stopVoice() {
      if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; }
    }

    function open() {
      overlay = document.createElement('div');
      overlay.className = 'ciw-overlay';
      var projectField = '';
      if (projects.length > 1 && config.allowProjectSwitch !== false) {
        var options = projects.map(function (p) {
          return '<option value="' + escapeHtml(p) + '"' + (p === projects[0] ? ' selected' : '') + '>#' + escapeHtml(p) + '</option>';
        }).join('');
        projectField = '<div class="ciw-field"><label for="ciw-project">Projekt</label><select id="ciw-project">' + options + '</select></div>';
      } else {
        projectField = '<div class="ciw-field"><label>Projekt</label><div>#' + escapeHtml(projects[0]) + '</div>' +
          '<input type="hidden" id="ciw-project" value="' + escapeHtml(projects[0]) + '"></div>';
      }

      overlay.innerHTML =
        '<div class="ciw-panel" role="dialog" aria-modal="true" aria-labelledby="ciw-title">' +
        '<h2 id="ciw-title">Rapportera ett problem</h2>' +
        projectField +
        '<div class="ciw-field"><label for="ciw-title-input">Titel <span class="ciw-hint">(valfri)</span></label>' +
        '<input id="ciw-title-input" type="text" maxlength="200" placeholder="Kort sammanfattning"></div>' +
        '<div class="ciw-field"><label for="ciw-body">Beskrivning</label>' +
        '<textarea id="ciw-body" required placeholder="Vad är fel? Vad förväntade du dig?"></textarea>' +
        '<div class="ciw-hint">Sparas som utkast (#issue-draft) i Codicent och granskas innan det blir ett GitHub-issue.</div></div>' +
        '<div class="ciw-field"><label>Ljudinspelning <span class="ciw-hint">(valfri, max 2 min)</span></label>' +
        '<div class="ciw-row" style="margin-top:0">' +
        '<button type="button" class="ciw-btn ciw-btn-secondary ciw-record">● Spela in ljud</button>' +
        '<span class="ciw-hint ciw-audio-status">Inget ljud inspelat. Mikrofonen används först när du trycker på Spela in.</span></div>' +
        '<div class="ciw-audio" hidden><audio class="ciw-audio-preview" controls></audio>' +
        '<div class="ciw-audio-name"></div>' +
        '<div class="ciw-row"><button type="button" class="ciw-btn ciw-btn-secondary ciw-audio-delete">Ta bort ljud / spela in igen</button></div></div>' +
        '<div class="ciw-hint">Ljudet bifogas rapporten och sparas i Codicent, där det kan transkriberas senare. Det är ljudfilen som gäller — inte webbläsarens text.</div></div>' +
        '<div class="ciw-row">' +
        '<button type="button" class="ciw-btn ciw-rec" hidden>🎙 Fyll i text med röst (valfritt)</button>' +
        '<span class="ciw-hint ciw-rec-hint" hidden>Valfri bekvämlighet: webbläsarens taligenkänning fyller i textfältet. Inte sanningskälla.</span></div>' +
        '<div class="ciw-row"><button type="button" class="ciw-btn ciw-send">Skicka som utkast</button>' +
        '<button type="button" class="ciw-btn ciw-btn-secondary ciw-cancel">Avbryt</button></div>' +
        '<div class="ciw-status" role="status" aria-live="polite"></div></div>';

      root.appendChild(overlay);
      var panel = overlay.querySelector('.ciw-panel');
      var bodyEl = overlay.querySelector('#ciw-body');
      var statusEl = overlay.querySelector('.ciw-status');
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      overlay.querySelector('.ciw-cancel').addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      function onKey(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); } }

      // --- Ljudinspelning: MediaRecorder (sanningskällan är ljudfilen) ---
      var mediaRecorder = null, mediaStream = null, audioChunks = [];
      var audioBlob = null, audioUrl = null, audioFilename = '', audioDurationSec = 0;
      var recordTimer = null, recordStartedAt = 0;
      var recordBtn = overlay.querySelector('.ciw-record');
      var audioStatus = overlay.querySelector('.ciw-audio-status');
      var audioBox = overlay.querySelector('.ciw-audio');
      var audioPreview = overlay.querySelector('.ciw-audio-preview');
      var audioName = overlay.querySelector('.ciw-audio-name');

      function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
      }
      function stopTracks() {
        if (mediaStream) { mediaStream.getTracks().forEach(function (t) { t.stop(); }); mediaStream = null; }
      }
      function clearAudio() {
        if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) {} audioUrl = null; }
        audioBlob = null; audioFilename = ''; audioDurationSec = 0; audioChunks = [];
        audioPreview.removeAttribute('src'); audioBox.hidden = true;
        audioStatus.textContent = 'Inget ljud inspelat. Mikrofonen används först när du trycker på Spela in.';
        recordBtn.textContent = '● Spela in ljud'; recordBtn.classList.remove('recording');
      }
      function stopRecording() {
        if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch (e) {} }
        recordBtn.textContent = '● Spela in ljud'; recordBtn.classList.remove('recording');
      }
      overlayCleanup = function () {
        if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch (e) {} }
        stopTracks();
        if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) {} }
      };
      overlay.querySelector('.ciw-audio-delete').addEventListener('click', clearAudio);

      if (!global.MediaRecorder || !(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        recordBtn.disabled = true;
        audioStatus.textContent = 'Ljudinspelning stöds inte i den här webbläsaren — skriv i stället (eller använd valfri röstifyllning nedan).';
      } else {
        recordBtn.addEventListener('click', async function () {
          if (mediaRecorder && mediaRecorder.state === 'recording') { stopRecording(); return; }
          clearAudio(); // ny inspelning ersätter gammal
          var stream;
          try {
            // Mikrofonbehörighet begärs FÖRST här, vid knapptryck.
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e) {
            audioStatus.textContent = 'Mikrofonen nekades eller är inte tillgänglig. Du kan skriva beskrivningen i stället.';
            setStatus('Inget ljud spelades in — skriv i stället, det går lika bra.', false);
            return;
          }
          mediaStream = stream; audioChunks = [];
          try { mediaRecorder = new MediaRecorder(stream); }
          catch (e) { stopTracks(); audioStatus.textContent = 'Kunde inte starta inspelningen i den här webbläsaren.'; return; }
          mediaRecorder.ondataavailable = function (e) { if (e.data && e.data.size) audioChunks.push(e.data); };
          mediaRecorder.onstop = function () {
            if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
            stopTracks();
            if (!audioChunks.length) return;
            var mime = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
            audioBlob = new Blob(audioChunks, { type: mime });
            var ext = mime.indexOf('ogg') >= 0 ? 'ogg' : (mime.indexOf('mp4') >= 0 || mime.indexOf('m4a') >= 0 ? 'm4a' : 'webm');
            audioFilename = 'issue-voice-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
            audioDurationSec = Math.min(MAX_AUDIO_SECONDS, Math.round((Date.now() - recordStartedAt) / 1000));
            audioUrl = URL.createObjectURL(audioBlob);
            audioPreview.src = audioUrl;
            audioName.textContent = 'Bifogat ljud: ' + audioFilename + ' · ' + fmtTime(audioDurationSec) + ' · ' + Math.round(audioBlob.size / 1024) + ' KB — lyssna gärna innan du skickar.';
            audioBox.hidden = false;
            audioStatus.textContent = 'Inspelning klar (' + fmtTime(audioDurationSec) + ' / ' + fmtTime(MAX_AUDIO_SECONDS) + ').';
            recordBtn.textContent = '● Spela in igen';
          };
          recordStartedAt = Date.now();
          mediaRecorder.start();
          recordBtn.textContent = '⏹ Stoppa inspelning'; recordBtn.classList.add('recording');
          audioStatus.textContent = 'Spelar in… 0:00 / ' + fmtTime(MAX_AUDIO_SECONDS);
          recordTimer = setInterval(function () {
            var elapsed = (Date.now() - recordStartedAt) / 1000;
            audioStatus.textContent = 'Spelar in… ' + fmtTime(elapsed) + ' / ' + fmtTime(MAX_AUDIO_SECONDS);
            if (elapsed >= MAX_AUDIO_SECONDS) stopRecording(); // hård gräns 2 min
          }, 250);
        });
      }

      // Röstinspelning: Web Speech API, sv-SE, när det stöds.
      var SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
      var recBtn = overlay.querySelector('.ciw-rec');
      var recHint = overlay.querySelector('.ciw-rec-hint');
      if (SpeechRecognition) {
        recBtn.hidden = false; recHint.hidden = false;
        recBtn.addEventListener('click', function () {
          if (recognition) { stopVoice(); recBtn.classList.remove('recording'); recBtn.textContent = '🎙 Fyll i text med röst (valfritt)'; return; }
          recognition = new SpeechRecognition();
          recognition.lang = SPEECH_LANG;
          recognition.interimResults = true;
          recognition.continuous = false;
          var base = bodyEl.value ? bodyEl.value.replace(/\s+$/, '') + ' ' : '';
          recognition.onresult = function (event) {
            var text = '';
            for (var i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
            bodyEl.value = base + text;
          };
          recognition.onerror = function (event) {
            setStatus('Röstinmatning misslyckades (' + event.error + '). Skriv i stället.', false);
            recBtn.classList.remove('recording'); recBtn.textContent = '🎙 Fyll i text med röst (valfritt)'; recognition = null;
          };
          recognition.onend = function () {
            recBtn.classList.remove('recording'); recBtn.textContent = '🎙 Fyll i text med röst (valfritt)'; recognition = null;
          };
          try { recognition.start(); recBtn.classList.add('recording'); recBtn.textContent = '⏹ Stoppa'; }
          catch (e) { setStatus('Kunde inte starta röstinmatning.', false); }
        });
      }

      function setStatus(text, ok) {
        statusEl.textContent = text;
        statusEl.className = 'ciw-status ' + (ok ? 'ok' : 'err');
      }

      overlay.querySelector('.ciw-send').addEventListener('click', async function () {
        var now = Date.now();
        if (now - lastSubmitAt < 10000) { setStatus('Vänta några sekunder innan du skickar igen.', false); return; }
        if (mediaRecorder && mediaRecorder.state === 'recording') { setStatus('Stoppa inspelningen innan du skickar.', false); return; }
        var projectEl = overlay.querySelector('#ciw-project');
        var audio = audioBlob ? { blob: audioBlob, filename: audioFilename, durationSec: audioDurationSec } : null;
        var payload = {
          project: String(projectEl.value || projects[0]).replace(/^#/, ''),
          title: overlay.querySelector('#ciw-title-input').value.trim(),
          body: bodyEl.value.trim(),
          page_url: global.location ? global.location.href : '',
          user_agent: global.navigator ? global.navigator.userAgent : '',
          created_at: new Date().toISOString(),
          source: 'issue-widget/' + VERSION,
          audio: audio ? { attached: true, filename: audioFilename, mime_type: audioBlob.type || 'audio/webm', duration_sec: audioDurationSec, size_bytes: audioBlob.size } : null
        };
        if (!payload.body && !audio) { setStatus('Skriv en beskrivning eller spela in ljud.', false); bodyEl.focus(); return; }
        if (!payload.title) payload.title = payload.body ? payload.body.slice(0, 80) : 'Röstinspelad rapport';

        var sendBtn = overlay.querySelector('.ciw-send');
        sendBtn.disabled = true;
        setStatus('Skickar…', true);
        try {
          var result = await sendToCodicent(payload, config, audio);
          lastSubmitAt = Date.now();
          host.dispatchEvent(new CustomEvent('codicent-issue:submitted', { bubbles: true, detail: { payload: payload, result: result } }));
          setStatus(result.demo
            ? 'Demo-läge: ingen endpoint konfigurerad. Meddelandet loggades i konsolen i stället för att skickas.'
            : 'Tack! Utkastet är sparat i Codicent (#issue-draft #' + payload.project + ').', true);
          bodyEl.value = ''; overlay.querySelector('#ciw-title-input').value = ''; clearAudio();
        } catch (err) {
          host.dispatchEvent(new CustomEvent('codicent-issue:error', { bubbles: true, detail: { error: String(err), payload: payload } }));
          setStatus('Kunde inte skicka: ' + err.message + '. Försök igen om en stund.', false);
        } finally { sendBtn.disabled = false; }
      });

      var first = panel.querySelector('#ciw-title-input');
      if (first) first.focus();
    }

    openBtn.addEventListener('click', open);
    return { open: open, close: close, version: VERSION, config: config };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Auto-init: element <div data-codicent-issue-widget ...></div>
  function autoInit() {
    document.querySelectorAll('[data-codicent-issue-widget]').forEach(function (el) {
      var d = el.dataset;
      createWidget({
        mount: el,
        project: d.project || '',
        projects: d.projects || '',
        endpoint: d.endpoint || '',
        apiKey: d.apiKey || '',
        buttonText: d.buttonText || '',
        allowProjectSwitch: d.allowProjectSwitch === 'true'
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

  global.CodicentIssueWidget = { init: createWidget, version: VERSION, _sendToCodicent: sendToCodicent };
})(typeof window !== 'undefined' ? window : globalThis);
