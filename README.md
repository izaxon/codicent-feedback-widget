# Codicent Issue Widget (prototyp)

Liten embedbar widget i vanilla JavaScript — ingen byggkedja, inga
ramverksberoenden. Besökare rapporterar ett problem (text eller röst,
sv-SE) direkt från en app. Rapporten skickas som ett **meddelande till
Codicent** och sparas som utkast (`#issue-draft`). Den går **aldrig**
direkt till GitHub.

Byggd enligt beslutad design: host-appen väljer projekt, widgeten är
bara ett formulär + en adapter som postar till Codicent.

## Filer

| Fil | Vad |
| --- | --- |
| `widget.js` | Hela widgeten. Shadow DOM, så hostens CSS varken läcker in eller ut (utom via variablerna nedan). |
| `demo.html` | Tre embed-exempel: data-attribut, flera projekt + CSS-tema, JS-config. Körs i demo-läge utan endpoint. |
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
    apiKey: window.__CODICENT_ISSUE_KEY__         // injiceras av hosten, se Säkerhet
  });
</script>
```

Öppna `demo.html` i en webbläsare för att testa. Utan `endpoint` är
widgeten i **demo-läge**: inget nätverksanrop görs, meddelandet loggas
i konsolen och eventet `codicent-issue:submitted` avfyras på sidan.

## Konfiguration

| Nyckel (JS) | Data-attribut | Betydelse |
| --- | --- | --- |
| `project` | `data-project` | Standardprojekt, t.ex. `nextphase` (utan `#`). |
| `projects` | `data-projects` | Komma-separerad lista, t.ex. `nextphase,qrit`. |
| `allowProjectSwitch` | `data-allow-project-switch="true"` | Visa dropdown så besökaren kan byta projekt (bara bland `projects`). Utelämnad = låst till första projektet. |
| `endpoint` | `data-endpoint` | Codicent-endpoint som tar emot POST. Tom = demo-läge. |
| `apiKey` | `data-api-key` | Scoped nyckel, se nedan. Sätt **inte** en riktig nyckel i incheckad HTML/JS. |
| `buttonText` | `data-button-text` | Text på öppna-knappen. |
| `mount` | — | CSS-selektor/element där knappen monteras (bara JS-config). |

### API-nyckel via Codicent-meddelande

Nyckeln definieras i hostprojektet i Codicent, t.ex. ett meddelande
taggat `#issue-widget-config #<projekt>` med nyckelns id, scope och
status. Host-appens backend läser configen, kontrollerar att nyckeln
är aktiv, och injicerar endpoint + nyckel när sidan renderas (eller
proxar anropet). Nyckeln ska vara:

- **Scoped:** får bara skapa `#issue-draft`-meddelanden i angivna projekt.
- **Återkallbar:** går att stänga av i Codicent-meddelandet utan deploy.
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

`Authorization: Bearer <scoped nyckel>` skickas som header.

## Flödet Codicent → GitHub-issue

1. Widgeten postar utkastet → Codicent sparar meddelandet med
   `#issue-draft #<projekt>`. Ingen GitHub-nyckel finns i klienten.
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
- **Scoped + återkallbar nyckel.** Nyckeln får bara skriva
  `#issue-draft` i projekt hosten angett. Rotera/stäng av via
  Codicent-meddelandet, inte via kodändring.
- **Validera serverns sida.** Backend måste kontrollera nyckel, projekt
  mot en tillåtlista, och längd på titel/body — lita aldrig på klienten.
- **Rate limit.** Backend bör begränsa per nyckel/IP (t.ex. 10/timme).
  Widgeten har dessutom en enkel 10-sekunders spärr mot dubbelklick.
- **Spam/öppen endpoint.** Eftersom vem som helst med nyckeln tekniskt
  kan posta: håll utkasten opublicerade, överväg honeypot/CAPTCHA om
  det blir spam, och logga `page_url`/`user_agent` som redan skickas.
- **Personuppgifter.** Fri text kan innehålla vad som helst. Granskaren
  i steg 2 är också PII-filtret innan något når GitHub.
- **Röst.** Web Speech API kan skicka ljud till webbläsarleverantörens
  tjänst (t.ex. Google i Chrome). Widgeten informerar inte automatiskt
  om detta i alla jurisdiktioner — lägg till en notis i host-appen om
  det krävs. Ingen ljudfil sparas av widgeten, bara transkriptet.

## Begränsningar i prototypen

- Endast `webkitSpeechRecognition`/`SpeechRecognition` (Chrome/Edge).
  Safari/Firefox får textfältet — formuläret fungerar likadant.
- Ingen filuppladdning/skärmbild, ingen inloggad identitet, ingen
  offline-kö. Medvetet utanför prototypen.
- Endpoint-formatet (`tags`/`text`/`payload`) är ett förslag tills
  Codicent fastställer sitt API — ändra bara i `sendToCodicent`.

## Test

```bash
node --check widget.js   # syntaxkontroll
```

Öppna sedan `demo.html` i Chrome: skriv/prata in en rapport, skicka,
och kontrollera konsolen + rutan "Senaste skickade utkast".
