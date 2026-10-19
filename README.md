# Codicent Issue Widget (prototyp)

Liten embedbar widget i vanilla JavaScript (ES2017+, Shadow DOM) — ingen
byggkedja, inga ramverksberoenden. Besökare rapporterar ett problem (text
och/eller inspelat ljud, sv-SE som standard, engelska med `lang: 'en'`) direkt
från en app. Ljudet spelas in i webbläsaren och bifogas som fil —
webbläsarens taligenkänning är bara en valfri ifyllnadshjälp. Rapporten skickas
som ett **meddelande till Codicent** och sparas som utkast (`#issue-draft`).
Den går **aldrig** direkt till GitHub.

Byggd enligt beslutad design: host-appen väljer projekt, widgeten är
bara ett formulär + en adapter som postar till Codicent.

**Live-demo (GitHub Pages):** https://izaxon.github.io/codicent-feedback-widget/

## Filer

| Fil | Vad |
| --- | --- |
| `widget.js` | Hela widgeten. Shadow DOM, så hostens CSS varken läcker in eller ut (utom via variablerna nedan). |
| `index.html` | Demon (GitHub Pages-startsidan): data-attribut, flera projekt + CSS-tema, JS-config, engelska + egen `send`. Körs i demo-läge. |
| `demo.html` | Bara en vidarebefordran till `index.html` (gamla länkar). Ändra aldrig här. |
| `.nojekyll` | Tom fil: GitHub Pages ska servera filerna råa (ingen Jekyll), så att `index.html` verkligen blir startsidan. |
| `PROMPT-claude-max.md` | Färdig snäv prompt för backend-biten i Codicent (kontrakt + tester). |
| `tests/`, `playwright.config.js`, `package.json` | Playwright-tester (riktig Chromium + fake-mikrofon). `npm test`. |
| `.github/workflows/test.yml` | Kör syntaxkontroll + testerna på varje PR och push till `main`. |

## Embedda

### Variant A — data-attribut (enklast)

```html
<div data-codicent-issue-widget
     data-project="nextphase"
     data-endpoint="https://…/codicent/issue-drafts"
     data-button-text="Rapportera ett problem"></div>
<script src="widget.js"></script>
```

`data-api-key` kan sättas av hosten när sidan renderas (se nedan). Widgeten
startar automatiskt för varje `[data-codicent-issue-widget]` som finns när
sidan laddats; element som läggs till senare (SPA) startas med `init()`.

`<script src="widget.js" data-endpoint="…" data-project="…">` ger *standardvärden*
åt alla widgetar på sidan men skapar ingen widget själv. Bara skriptet som
laddar `widget.js` läses — ett async/dynamiskt laddat skript har inga
standardvärden, använd då `init()`.

### Variant B — JS-config (rekommenderas när endpoint/nyckel sätts av hosten)

```html
<div id="issue-widget"></div>
<script src="widget.js"></script>
<script>
  const widget = window.CodicentIssueWidget.init({
    mount: '#issue-widget',
    project: 'nextphase',
    endpoint: 'https://…/codicent/issue-drafts',  // Codicents mottagar-endpoint
    apiKey: window.__CODICENT_ISSUE_KEY__         // nyckelvärdet injiceras av hosten; nyckeln är registrerad med #api-key i Codicent, se nedan
  });
  // widget.open(), widget.close(), widget.destroy()
</script>
```

`init()` är idempotent per mount-element (ett andra anrop returnerar samma
widget) och returnerar `null` med ett `console.error` om `project` saknas eller
Shadow DOM inte stöds. Ingen `nextphase`-fallback finns längre: ett felkonfigurerat
embed ska inte skicka rapporter till ett riktigt projekt.

### Demo-läge

Öppna [live-demon](https://izaxon.github.io/codicent-feedback-widget/) eller
`index.html` i en webbläsare. Demo-läge måste väljas uttryckligen med
`demo: true` / `data-demo="true"`: inget nätverksanrop görs, meddelandet loggas
i konsolen och eventet `codicent-issue:submitted` avfyras. **Utan** endpoint och
utan `demo` vägrar widgeten skicka (felmeddelande + `console.error` vid start),
så att en trasig produktionskonfiguration aldrig ser ut som ett lyckat skick.

## Konfiguration

| Nyckel (JS) | Data-attribut | Betydelse |
| --- | --- | --- |
| `project` | `data-project` | Standardprojekt, t.ex. `nextphase` (utan `#`). Krävs (eller `projects`). |
| `projects` | `data-projects` | Komma-separerad lista, t.ex. `nextphase,qrit`. |
| `allowProjectSwitch` | `data-allow-project-switch="true"` | Visa dropdown så besökaren kan byta projekt (bara bland `projects`). Utelämnad = låst till första projektet. |
| `endpoint` | `data-endpoint` | Codicent-endpoint som tar emot POST. |
| `apiKey` | `data-api-key` | Värdet för nyckeln som är definierad/registrerad i ett `#api-key`-meddelande i Codicent, se nedan. Hosten injicerar värdet vid sidladdning. Sätt **inte** en riktig nyckel i incheckad HTML/JS. |
| `demo` | `data-demo="true"` | Demo-läge utan nätverksanrop (se ovan). |
| `timeoutMs` | `data-timeout-ms` | Avbryt skicket efter så här lång tid (standard 30000). |
| `buttonText` | `data-button-text` | Text på öppna-knappen. |
| `lang` | `data-lang` | `sv` (standard) eller `en`. Styr alla texter och taligenkänningens språk. |
| `messages` | — | Objekt som åsidosätter enskilda texter, t.ex. `{ send: 'Skicka nu', privacyNotice: '' }`. Nycklarna finns överst i `widget.js`. `{x}` byts mot värden. |
| `speechLang` | `data-speech-lang` | Åsidosätter taligenkänningens språk (standard `sv-SE` / `en-US`). |
| `pageUrl` | `data-page-url` | `path` (standard: adress utan query/hash), `full` eller `none`. Query/hash kan innehålla tokens eller personuppgifter. |
| `includeUserAgent` | `data-include-user-agent="true"` | Skicka `user_agent` i payloaden (standard av — servern ser `User-Agent` ändå). |
| `privacyUrl` | `data-privacy-url` | Länk (bara `http(s)://` eller `/…`) efter integritetsnotisen. Själva notisen sätts/tas bort via `messages.privacyNotice`. |
| `maxBodyLength` | `data-max-body-length` | Max tecken i beskrivningen (standard 5000, samma som backend). |
| `maxAudioBytes` | `data-max-audio-bytes` | Max ljudstorlek (standard 5 MB, samma som backend). |
| `send` | — | `async (payload, config, audio) => ({ ok: true, id })` ersätter `sendToCodicent`, så hosten slipper forka `widget.js`. Kasta `Error` vid fel. |
| `mount` | — | CSS-selektor/element där knappen monteras (bara JS-config). Hittas det inte monteras widgeten sist på sidan med en varning. |

Tomma värden (`''`) skriver aldrig över ett satt värde. Utkast (text, titel,
ljud) bevaras om dialogen stängs med Escape eller klick på bakgrunden
(en markering som dras ut över bakgrunden stänger inte); **Avbryt** och
**Stäng** kastar det. Utkastet finns bara i minnet, inte i `localStorage`.

### API-nyckel definieras med `#api-key` i Codicent

Nyckeln definieras/registreras på Codicents meddelandebaserade sätt:
**ett data-meddelande per nyckel i hostprojektet i Codicent, taggat
`#api-key`** (befintligt mönster: `#data #api-key`, där `@<projekt>` i
meddelandet binder nyckeln till hostprojektet). Det finns ingen separat
`#issue-widget-config`. Exakt modell:

```text
@nextphase #data #api-key
Issue widget — nextphase (får bara skapa #issue-draft)

{
  "key_id": "issue-widget-nextphase-v1",
  "api_key_sha256": "<SHA-256 av nyckelvärdet, hex>",
  "allowed_projects": ["nextphase"],
  "allowed_origins": ["https://appen.example"],
  "endpoint": "POST /codicent/issue-drafts",
  "allowed_tags": ["issue-draft"],
  "active": true,
  "created_at": "2026-10-18T09:00:00Z",
  "expires_at": null
}
```

Fälten:

| Fält | Betydelse |
| --- | --- |
| `key_id` | Mänskligt id för nyckeln, används i loggar och vid rotation. |
| `api_key_sha256` | **Endast hash av nyckelvärdet** (SHA-256, hex) — aldrig klartextvärdet i meddelandet. Följer `#apidef`/`CodicentApiController`-mönstret i codicent-core: servern hashar den inkommande `X-API-Key`-headern och jämför i fast tid. |
| `allowed_projects` | Projekt nyckeln får skapa `#issue-draft` i. Måste matcha både `@<projekt>`-bindningen och `project` i widgetens POST. |
| `allowed_origins` | *Valfritt.* Origins (`Origin`-headern) som får använda nyckeln; saknas/tom = ingen begränsning. Rekommenderas: nyckeln ligger i webbläsaren och är därför inte hemlig. |
| `endpoint` | Den enda route nyckeln gäller för, metod + sökväg. |
| `allowed_tags` | Alltid `["issue-draft"]` för widgeten. |
| `active` | `true`/`false`. Återkalla genom att uppdatera meddelandet (`UpdateDataMessage`) till `"active": false` — ingen deploy krävs. |
| `created_at` / `expires_at` | ISO 8601. `expires_at: null` = tills vidare; satt tidpunkt i det förflutna = utgången nyckel. |

Så flödar värdet:

1. Nyckelvärdet genereras en gång och visas bara då. Dess SHA-256-hash
   läggs i `#api-key`-meddelandet ovan. Själva värdet förvaras i
   host-appens hemliga config (env/secret store, aldrig incheckat).
2. Hosten injicerar värdet när sidan renderas, via
   `window.__CODICENT_ISSUE_KEY__` eller servern renderar
   `data-api-key`. Widgeten får alltså värdet enbart via host-config —
   den hämtar eller härleder det aldrig från Codicent, och webbläsaren
   behöver ingen läsåtkomst till `#api-key`-meddelandena.
3. Servern (backend i Codicent, se `PROMPT-claude-max.md`) löser upp
   och validerar vid varje anrop: hitta `#api-key`-meddelanden i
   hostprojektet, hasha inkommande `X-API-Key`, jämför hashen, kräv
   `active: true`, ej utgången, och att `allowed_projects`/`endpoint`
   (och `allowed_origins` om satt) täcker anropet. Okänd, avstängd eller
   utgången nyckel → 401; projekt/route/origin utanför scope → 403.
4. Rotation: skapa ett nytt `#api-key`-meddelande med ny `key_id`/hash,
   lägg det nya värdet i hostens hemliga config, sätt det gamla
   meddelandet till `"active": false`.

Ärlighetsnot: dagens generiska `#api-key`-uppslag i codicent-core
(`ControllerExtensions`) matchar ännu ett klartextfält `api_key` i
meddelandet. Hash-modellen ovan följer i stället det nyare
route-scopade `#apidef`-mönstret (`CodicentApiController`, SHA-256 +
fast-tidsjämförelse av `X-API-Key`). Att widget-backend validerar mot
`api_key_sha256` + `active`/`expires_at`/`allowed_projects` är alltså
nytt backend-jobb (se prompten), inte något som redan är live. Mixa
inte modellerna i samma meddelande.

Nyckeln ska vara:

- **Scoped:** får bara skapa `#issue-draft`-meddelanden i angivna projekt.
- **Återkallbar:** går att stänga av i `#api-key`-meddelandet utan deploy.
- **Aldrig** en GitHub-token eller en generell Codicent-nyckel.
- **Inte en hemlighet.** Allt som injiceras i en webbsida kan läsas av
  den som besöker sidan. Skyddet mot missbruk är därför serversidan:
  `allowed_origins`, rate limit per nyckel *och* IP, storleksgränser och
  att utkasten förblir modererade (se Säkerhet).

Widgetkoden innehåller varken endpoint eller nyckel — båda kommer
alltid via config.

### Anpassa utseende (CSS)

Shadow DOM isolerar widgeten. Styr den med CSS-variabler — de kan sättas på
**valfri förfader** till widgeten (mount-elementet, en wrapper, `:root`), eftersom
widgeten bara har fallback-värden och ärver resten:

```css
.min-app {
  --ciw-accent: #7c3aed;     /* accenter (fokus, standardknapp) */
  --ciw-button-bg: #7c3aed;  /* knappbakgrund */
  --ciw-button-text: #fff;
  --ciw-panel-bg: #faf5ff;   /* formulärets bakgrund */
  --ciw-bg: #fff;            /* fältens bakgrund (standard = --ciw-panel-bg) */
  --ciw-text: #111827;
  --ciw-muted: #6b7280;      /* hjälptexter */
  --ciw-border: #c4b5fd;
  --ciw-radius: 999px;       /* hörnradie (panelen begränsas till 24px) */
  --ciw-font: Georgia, serif;
}
```

Se `index.html` avsnitt 2 för ett komplett exempel (testas i `tests/`).

## Vad som skickas

Klienten skickar **bara strukturerad data**, aldrig färdig meddelandetext eller
taggar. Servern bygger meddelandet `#issue-draft #<projekt>\n\n<JSON>` från den
validerade payloaden — så att en klient inte kan välja vilka taggar (och därmed
vilka motor-åtgärder) ett meddelande får. Adaptern är `sendToCodicent` i
`widget.js` (eller `config.send`).

Utan ljud: `POST` med `Content-Type: application/json` och headern
`X-API-Key: <nyckelvärdet för #api-key-nyckeln>` (servern hashar och jämför mot
`api_key_sha256`, se ovan):

```json
{
  "project": "nextphase",
  "payload": {
    "client_id": "6f1c0c2e-…",
    "project": "nextphase",
    "title": "Kort titel eller början av beskrivningen",
    "body": "Beskrivningen, skriven eller inpratad…",
    "client_created_at": "2026-10-18T09:10:00.000Z",
    "source": "issue-widget/0.4.0",
    "audio": null,
    "page_url": "https://appen.example/sida"
  }
}
```

- `client_id` är en idempotensnyckel: samma id vid omförsök av samma rapport,
  nytt efter lyckat skick. Servern ska inte skapa ett andra utkast för samma
  `client_id` utan returnera det första `id`.
- `client_created_at` är klientens klocka; servern sätter den riktiga tidsstämpeln.
- `page_url` är som standard utan query/hash (`pageUrl: 'full'` ger hela, `'none'`
  utelämnar fältet). `user_agent` skickas bara med `includeUserAgent: true`.
- Ett lyckat svar måste vara JSON med `id` (eller `messageId`). En 2xx utan id —
  t.ex. en proxy- eller SPA-sida som svarar 200 — räknas som fel.

### Med ljud: multipart/form-data

Spelar besökaren in ljud skickas i stället `multipart/form-data`
(primärt format — base64 används inte):

| Fält | Innehåll |
| --- | --- |
| `project` | Projekt utan `#` |
| `payload` | Samma JSON som ovan som sträng; `audio` är då `{attached, filename, mime_type, duration_sec, size_bytes}` |
| `audio` | Ljudfilen, filnamn `issue-voice-<timestamp>.webm` (ändelse efter verklig MIME-typ: webm/ogg/m4a). MIME-typen skickas utan codecs-parameter (`audio/webm`, `audio/ogg`, `audio/mp4`). |

Mikrofonbehörighet begärs först när besökaren trycker på *Spela in ljud*; nekas
den går det att skriva i stället (och en tidigare inspelning behålls).
Inspelningen stoppas automatiskt vid **2 minuter**. Uppspelning och
ta bort/spela in igen finns innan skick. `duration_sec` är klientens mätning —
Chromes webm saknar duration-metadata, så servern måste själv kontrollera
längden (med några sekunders marginal). Widgeten avvisar inspelningar över
`maxAudioBytes` (5 MB) innan skick.

### Felhantering

Skicket avbryts efter `timeoutMs`. Widgeten visar begripliga texter för
400/422 (avvisad), 401/403 (ingen behörighet), 413 (för stort), 429 (rate limit),
5xx, nätverksfel och timeout; formuläret behålls så att besökaren kan försöka igen.
Servern behöver svara på CORS-preflight (`X-API-Key` + `Content-Type` utlöser
`OPTIONS`) för tillåtna origins.

**Adapter-ansvar (backend, out of scope här):** ta emot multipart,
bifoga `audio`-filen till det skapade `#issue-draft`-meddelandet i
Codicent, och transkribera server-side i ett senare steg som fyller i
ett textfält (t.ex. `transcript`/`body`) — originaljudet behålls alltid
kvar som bilaga. Widgeten sätter aldrig transkriptet som sanning.

## Flödet Codicent → GitHub-issue

1. Widgeten postar utkastet (eventuellt med ljudfil) → Codicent sparar
   meddelandet med `#issue-draft #<projekt>` och ljudet som bilaga.
   Ingen GitHub-nyckel finns i klienten.
2. I Codicent granskas utkastet (i `/threads` eller motsvarande vy).
   Spam/dubbletter raderas, bra rapporter redigeras vid behov.
3. Vid godkännande transformeras meddelandet till ett GitHub-issue i
   projektets repo (titel/body från JSON-fälten ovan), och meddelandet
   taggas om, t.ex. `#issue-created` + issue-länk/nummer.
4. Besökaren behöver varken GitHub-konto eller Codicent-konto — men
   rapporten är alltid modererad innan den blir publik.

Backend-stegen 1 (mottagning/validering) och 3 är **inte** del av den
här prototypen — se `PROMPT-claude-max.md`.

## Säkerhet

- **Utkast först, alltid.** Widgeten kan bara skapa utkast. Publicering
  till GitHub sker först efter mänsklig granskning i Codicent.
- **Ingen GitHub-nyckel i klienten.** Aldrig. GitHub-tokenen bor bara
  i Codicents backend vid transform-steget.
- **Scoped + återkallbar nyckel — men inte hemlig.** Nyckeln definieras i
  ett `#api-key`-meddelande i Codicent (endast hash, se ovan) och får bara
  skriva `#issue-draft` i projekt hosten angett. Rotera/stäng av genom
  att uppdatera det meddelandet (`active: false`), inte via kodändring.
  Eftersom värdet ligger i webbläsaren kan vem som helst som kan läsa sidan
  posta med det: begränsa med `allowed_origins`, rate limit per nyckel och IP.
- **Servern bygger meddelandet.** Klienten skickar bara `{ project, payload }`.
  Server-sidan ska aldrig ta text eller taggar från klienten (annars kan
  `allowed_tags` kringgås).
- **Validera serverns sida.** Backend måste kontrollera nyckel, projekt
  mot en tillåtlista, och längd på titel (≤ 200) / body (≤ 5000) — lita aldrig
  på klienten. Widgetens `maxlength` och 5 MB-gräns är bara bekvämlighet.
- **Rate limit.** Backend bör begränsa per nyckel/IP (t.ex. 10/timme).
  Widgeten har ingen egen spärr som går att lita på (den går att kringgå
  genom att ladda om sidan); den inaktiverar bara skicka-knappen medan ett
  anrop pågår och återanvänder `client_id` vid omförsök.
- **Spam/öppen endpoint.** Eftersom vem som helst med nyckeln tekniskt
  kan posta: håll utkasten opublicerade, överväg honeypot/CAPTCHA om
  det blir spam.
- **Personuppgifter.** Fri text kan innehålla vad som helst. Widgeten visar en
  integritetsnotis (text och länk styrs via `messages.privacyNotice` /
  `privacyUrl`), skickar som standard sidans adress utan query/hash och inget
  `user_agent`. Granskaren i steg 2 är också PII-filtret innan något når GitHub.
- **Röst/ljud.** Den inspelade ljudfilen (MediaRecorder) skickas till
  Codicent och **lagras där som bilaga** till `#issue-draft`-meddelandet.
  Vilka kan lyssna: alla som har läsåtkomst till projektets
  `#issue-draft`-meddelanden i Codicent (i praktiken granskarna/
  projektmedlemmarna) — ingen annan, och ljudet går inte till GitHub.
  Röst kan vara personuppgift/biometrisk: informera i host-appen.
  *Retention (förslag, beslutas av host/projekt):* behåll ljudet tills
  transkriptet är kontrollerat och ärendet är avgjort, radera senast
  90 dagar efter skapande — transkript + metadata behålls, ljudet raderas.
  Den valfria Web Speech-ifyllnaden kan däremot skicka ljud till
  webbläsarleverantörens tjänst (t.ex. Google i Chrome); den är tydligt
  markerad som valfri (även i widgetens egen text) och är aldrig sanningskälla.
- **Storleks-/tidsgräns för ljud.** Widgeten stoppar vid 2 min och avvisar
  > 5 MB. Backend måste också kontrollera: max 2 min (egen mätning, några
  sekunders marginal), max t.ex. 5 MB, bara `audio/webm|ogg|mp4` — avvisa
  större med 400/413.

## Begränsningar i prototypen

- Kräver ES2017+ (async/await) och Shadow DOM. Ljudinspelning kräver
  `MediaRecorder` + `getUserMedia` i en säker kontext (https eller localhost);
  MIME-typ varierar: webm/ogg/mp4. Saknas stödet fungerar textfältet likadant.
- Den valfria tal-till-text-ifyllnaden använder
  `SpeechRecognition`/`webkitSpeechRecognition` (Chrome/Edge) och körs inte
  samtidigt som ljudinspelning (de delar mikrofonen).
- Ingen skärmbild/uppladdning utöver ljud, ingen inloggad identitet,
  ingen offline-kö. Medvetet utanför prototypen.
- Server-side transkribering är inte byggd — backend bifogar ljudet
  nu, transkriberar senare (se `PROMPT-claude-max.md`).
- Endpoint-formatet (`{ project, payload }`) är ett förslag tills
  Codicent fastställer sitt API — ändra bara i `sendToCodicent` (eller via `send`).
- Versionering: ladda en taggad release och använd Subresource Integrity
  (`integrity="sha384-…"`) om du self-hostar eller hämtar `widget.js` från en CDN.

## Test

```bash
npm install            # en gång (installerar Playwright)
npx playwright install chromium   # en gång, om webbläsaren saknas
npm run check          # node --check widget.js
npm test               # Playwright mot riktig Chromium, fake-mikrofon, mockad endpoint
```

Testerna täcker bl.a. CSS-variabler på förfader, Escape/fokus/focus trap,
bevarat utkast, mikrofon som släpps, nekad mikrofon, taligenkänning, multipart,
omförsök med samma `client_id`, felmappning, språk, integritetsnotis och
storleksgränser. Öppna också `index.html` i Chrome och prova med riktig mikrofon.
