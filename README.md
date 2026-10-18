# Codicent Issue Widget (prototyp)

Liten embedbar widget i vanilla JavaScript — ingen byggkedja, inga
ramverksberoenden. Besökare rapporterar ett problem (text och/eller inspelat ljud,
sv-SE) direkt från en app. Ljudet spelas in i webbläsaren och bifogas
som fil — webbläsarens taligenkänning är bara en valfri ifyllnadshjälp. Rapporten skickas som ett **meddelande till
Codicent** och sparas som utkast (`#issue-draft`). Den går **aldrig**
direkt till GitHub.

Byggd enligt beslutad design: host-appen väljer projekt, widgeten är
bara ett formulär + en adapter som postar till Codicent.

**Live-demo (GitHub Pages):** https://izaxon.github.io/codicent-feedback-widget/

## Filer

| Fil | Vad |
| --- | --- |
| `widget.js` | Hela widgeten. Shadow DOM, så hostens CSS varken läcker in eller ut (utom via variablerna nedan). |
| `demo.html` | Tre embed-exempel: data-attribut, flera projekt + CSS-tema, JS-config. Körs i demo-läge utan endpoint. |
| `index.html` | Kopia av `demo.html` så att GitHub Pages visar demon som startsida. **Håll i synk:** ändra alltid `demo.html` och kopiera sedan till `index.html` (`cp demo.html index.html`). |
| `PROMPT-claude-max.md` | Färdig snäv prompt för backend-biten i Codicent. |

## Embedda

### Variant A — data-attribut (enklast)

```html
<div data-codicent-issue-widget
     data-project="nextphase"
     data-button-text="Rapportera ett problem"></div>
<script src="widget.js"></script>
```

### Variant B — JS-config (rekommenderas när endpoint/nyckel sätts av hosten)

```html
<div id="issue-widget"></div>
<script src="widget.js"></script>
<script>
  window.CodicentIssueWidget.init({
    mount: '#issue-widget',
    project: 'nextphase',
    endpoint: 'https://…/codicent/issue-drafts',  // Codicents mottagar-endpoint
    apiKey: window.__CODICENT_ISSUE_KEY__         // nyckelvärdet injiceras av hosten; nyckeln är registrerad med #api-key i Codicent, se nedan
  });
</script>
```

Öppna `demo.html` i en webbläsare för att testa, eller prova [live-demon på GitHub Pages](https://izaxon.github.io/codicent-feedback-widget/). Utan `endpoint` är
widgeten i **demo-läge**: inget nätverksanrop görs, meddelandet loggas
i konsolen och eventet `codicent-issue:submitted` avfyras på sidan.

## Konfiguration

| Nyckel (JS) | Data-attribut | Betydelse |
| --- | --- | --- |
| `project` | `data-project` | Standardprojekt, t.ex. `nextphase` (utan `#`). |
| `projects` | `data-projects` | Komma-separerad lista, t.ex. `nextphase,qrit`. |
| `allowProjectSwitch` | `data-allow-project-switch="true"` | Visa dropdown så besökaren kan byta projekt (bara bland `projects`). Utelämnad = låst till första projektet. |
| `endpoint` | `data-endpoint` | Codicent-endpoint som tar emot POST. Tom = demo-läge. |
| `apiKey` | `data-api-key` | Värdet för nyckeln som är definierad/registrerad i ett `#api-key`-meddelande i Codicent, se nedan. Hosten injicerar värdet vid sidladdning. Sätt **inte** en riktig nyckel i incheckad HTML/JS. |
| `buttonText` | `data-button-text` | Text på öppna-knappen. |
| `mount` | — | CSS-selektor/element där knappen monteras (bara JS-config). |

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
   täcker anropet. Okänd, avstängd eller utgången nyckel → 401;
   projekt/route utanför scope → 403.
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

Widgetkoden innehåller varken endpoint eller nyckel — båda kommer
alltid via config.

### Anpassa utseende (CSS)

Shadow DOM isolerar widgeten. Styr den med CSS-variabler på wrappern:

```css
.min-app {
  --ciw-accent: #7c3aed;     /* accenter */
  --ciw-button-bg: #7c3aed;  /* knappbakgrund */
  --ciw-button-text: #fff;
  --ciw-panel-bg: #faf5ff;   /* formulärets bakgrund */
  --ciw-text: #111827;
  --ciw-border: #c4b5fd;
  --ciw-radius: 999px;       /* hörnradie */
  --ciw-font: Georgia, serif;
}
```

Se `demo.html` avsnitt 2 för ett komplett exempel.

## Vad som skickas

En POST (i adapterfunktionen `sendToCodicent` i `widget.js` — enda
stället som behöver ändras när Codicent kopplar sitt riktiga API,
t.ex. befintligt `#apidef`/`UpdateDataMessage`-mönster eller
`post_message`). Meddelandetexten till Codicent är:

```text
#issue-draft #nextphase

{
  "project": "nextphase",
  "title": "Kort titel eller början av beskrivningen",
  "body": "Beskrivningen, skriven eller inpratad…",
  "page_url": "https://appen.example/sida",
  "user_agent": "Mozilla/5.0 …",
  "created_at": "2026-10-18T09:10:00.000Z",
  "source": "issue-widget/0.1.0"
}
```

`X-API-Key: <nyckelvärdet för #api-key-nyckeln>` skickas som header (servern hashar och jämför mot `api_key_sha256`, se ovan).

### Med ljud: multipart/form-data

Spelar besökaren in ljud skickas i stället `multipart/form-data`
(primärt format — base64 används inte):

| Fält | Innehåll |
| --- | --- |
| `project` | Projekt utan `#` |
| `tags` | JSON: `["issue-draft","<projekt>"]` |
| `text` | Meddelandetexten ovan (`#issue-draft #<projekt>` + JSON) |
| `payload` | Samma JSON som sträng; innehåller `audio: {attached, filename, mime_type, duration_sec, size_bytes}` |
| `audio` | Ljudfilen, filnamn `issue-voice-<timestamp>.webm` (ändelse efter verklig MIME-typ: webm/ogg/m4a) |

Anpassningar i JSON-läget: fältet `audio` är då `null` och text-only
fungerar precis som förut. Mikrofonbehörighet begärs först när besökaren
trycker på *Spela in ljud*; nekas den går det att skriva i stället.
Inspelningen stoppas automatiskt vid **2 minuter**. Uppspelning och
ta bort/spela in igen finns innan skick.

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
- **Scoped + återkallbar nyckel.** Nyckeln definieras i ett
  `#api-key`-meddelande i Codicent (endast hash, se ovan) och får bara
  skriva `#issue-draft` i projekt hosten angett. Rotera/stäng av genom
  att uppdatera det meddelandet (`active: false`), inte via kodändring.
- **Validera serverns sida.** Backend måste kontrollera nyckel, projekt
  mot en tillåtlista, och längd på titel/body — lita aldrig på klienten.
- **Rate limit.** Backend bör begränsa per nyckel/IP (t.ex. 10/timme).
  Widgeten har dessutom en enkel 10-sekunders spärr mot dubbelklick.
- **Spam/öppen endpoint.** Eftersom vem som helst med nyckeln tekniskt
  kan posta: håll utkasten opublicerade, överväg honeypot/CAPTCHA om
  det blir spam, och logga `page_url`/`user_agent` som redan skickas.
- **Personuppgifter.** Fri text kan innehålla vad som helst. Granskaren
  i steg 2 är också PII-filtret innan något når GitHub.
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
  markerad som valfri och är aldrig sanningskälla.
- **Storleks-/tidsgräns för ljud.** Widgeten stoppar vid 2 min.
  Backend måste också kontrollera: max 2 min, max t.ex. 5 MB, bara
  `audio/*` (webm/ogg/m4a/mp4) — avvisa större med 400/413.

## Begränsningar i prototypen

- Ljudinspelning kräver `MediaRecorder` + `getUserMedia` (Chrome/Edge/
  Firefox/Safari i moderna versioner, MIME-typ varierar: webm/ogg/m4a).
  Saknas stödet fungerar textfältet likadant.
- Den valfria tal-till-text-ifyllnaden använder
  `webkitSpeechRecognition`/`SpeechRecognition` (Chrome/Edge).
- Ingen skärmbild/uppladdning utöver ljud, ingen inloggad identitet,
  ingen offline-kö. Medvetet utanför prototypen.
- Server-side transkribering är inte byggd — backend bifogar ljudet
  nu, transkriberar senare (se `PROMPT-claude-max.md`).
- Endpoint-formatet (`tags`/`text`/`payload`) är ett förslag tills
  Codicent fastställer sitt API — ändra bara i `sendToCodicent`.

## Test

```bash
node --check widget.js   # syntaxkontroll
```

Öppna sedan `demo.html` i Chrome: skriv en rapport, och/eller spela in
ljud (kolla tidsräknare, uppspelning, ta bort/spela in igen, bifogat
filnamn i rutan), skicka, och kontrollera konsolen + rutan "Senaste
skickade utkast". Prova också att neka mikrofonen — text ska fungera.
