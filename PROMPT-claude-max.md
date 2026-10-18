# Prompt till Claude MAX: backend för issue-widgeten i Codicent

Kopiera allt under strecket till Claude. Widgeten (klienten) är redan
byggd: den postar till en endpoint med headern
`X-API-Key: <nyckelvärdet för #api-key-nyckeln>` och meddelandetexten
`#issue-draft #<projekt>` + JSON
med fälten `project, title, body, page_url, user_agent, created_at,
source, audio`. Utan ljud: JSON som förut. **Med ljud:
`multipart/form-data`** med fälten `project`, `tags` (JSON-sträng),
`text`, `payload` (JSON-sträng) och filfältet **`audio`**
(`issue-voice-<timestamp>.webm`, MIME varierar webm/ogg/m4a); payloadens
`audio` innehåller `{attached, filename, mime_type, duration_sec,
size_bytes}`. Ljud är valfritt och `body` kan vara tom när ljud finns.
Ändra inte widgetens format — bygg mottagaren efter det.

---

Du jobbar i codicent-core (befintlig kodbas, följ dess mönster för
API/`#apidef`/`UpdateDataMessage`/`post_message` — välj det som redan
finns för att skapa ett meddelande utifrån, bygg inget parallellt system).

Implementera, i små steg med tester:

1. **Mottagning + nyckelvalidering mot `#api-key`:** En endpoint som tar
   emot widgetens POST och validerar `X-API-Key` mot nyckeldefinitionen
   i Codicent. Nyckeln är definierad/registrerad som ett data-meddelande
   i hostprojektet taggat `#data #api-key` (`@<projekt>` binder den till
   hostprojektet), med exakt dessa fält:

   ```json
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

   Lös upp och validera så här vid varje anrop (följ det route-scopade
   `#apidef`/`CodicentApiController`-mönstret för hash-jämförelsen):
   hitta `#api-key`-meddelandena i hostprojektet, SHA-256-hasha den
   inkommande nyckeln, jämför mot `api_key_sha256` i fast tid
   (`CryptographicOperations.FixedTimeEquals`), kräv `active: true`,
   kräv `expires_at` null eller i framtiden, och kräv att
   `allowed_projects` innehåller payloadens `project` samt att
   `endpoint` matchar routen. Lagra aldrig klartextvärdet i
   meddelandet. Notera ärligt: dagens generiska `#api-key`-uppslag i
   `ControllerExtensions` matchar klartextfältet `api_key` — återanvänd
   gärna uppslagningen av `#api-key`-meddelanden, men hash-valideringen
   plus `active`/`expires_at`/`allowed_projects`/`endpoint`-kontrollen
   är ny kod med nya tester; bygg den i stället för att påstå att den
   redan finns. Avvisa okänd/avstängd/utgången nyckel (401) och projekt
   eller route utanför tillåtlistan (403). Begränsa titel ≤ 200 tecken,
   body ≤ 5 000 tecken. Rate limit per nyckel (`key_id`), t.ex.
   10 anrop/timme (429).
   Återkallelse/rotation sker utanför koden: uppdatera
   `#api-key`-meddelandet (`UpdateDataMessage`) till `"active": false`,
   resp. skapa ett nytt `#api-key`-meddelande och stäng det gamla —
   ingen deploy, ingen kodändring. Testa att ett uppdaterat/avstängt
   meddelande omedelbart ger 401.
2. **Spara som utkast:** Skapa meddelandet exakt med taggarna
   `#issue-draft #<projekt>` och JSON-texten oförändrad, så det syns i
   befintliga vyer. Returnera `{ id }`. Skapa **aldrig** GitHub-issue här.
2b. **Ljudbilaga + transkribering (server-side):** Om multipart-fältet
   `audio` finns: validera serverns sida (bara `audio/*` webm/ogg/m4a/mp4,
   max 2 min enligt `duration_sec` + egen kontroll där det går, max
   t.ex. 5 MB → annars 400/413) och **bifoga filen till det skapade
   `#issue-draft`-meddelandet** med befintlig bilagemekanism i Codicent —
   bygg ingen parallell fillagring. Kör sedan (asynkront jobb är ok)
   server-side transkribering (sv-SE) som skriver resultatet i ett
   separat textfält på meddelandet, t.ex. `transcript` i JSON och/eller
   `body` om body var tom — **skriv aldrig över originaljudet och radera
   det inte**; ljudfilen förblir bilaga och sanningskälla. Markera gärna
   `transcript_status: pending|done|failed`; vid failed behålls ljudet
   och granskaren kan lyssna manuellt. Ljudet följer inte med till GitHub
   vid transform — bara (granskad) text.
3. **Transform vid godkännande:** En separat, explicit åtgärd (knapp/
   kommando i Codicent, kräver inloggad granskare) som läser ett
   `#issue-draft`-meddelande, skapar ett GitHub-issue i projektets repo
   (repo-mappning i hostprojektets befintliga Codicent-config — lägg
   den inte i `#api-key`-meddelandet, som bara är nyckeldefinition —
   GitHub-token bara på servern), postar tillbaka issue-länken som
   svar/taggar meddelandet
   `#issue-created`, och är idempotent (kör aldrig två gånger på samma
   meddelande).
4. **Tester:** giltig nyckel (hash matchar ett aktivt `#api-key`-
   meddelande) → utkast skapas; fel nyckel → 401; nyckel vars
   `#api-key`-meddelande uppdaterats till `"active": false` → 401;
   utgången nyckel (`expires_at` passerat) → 401; otillåtet projekt →
   403; route utanför `endpoint`-fältet → 403; för lång body → 400;
   multipart med giltigt ljud → utkast skapas **med ljudet bifogat**;
   för stor/fel MIME-typ på ljud → 400/413 och inget utkast (eller utkast
   utan ljud + tydligt fel — välj ett och testa det); transkribering
   fyller textfältet och originaljudet finns kvar; text-only utan ljud
   fungerar som förut; transform skapar exakt ett issue och andra
   anropet är en no-op.

Håll diffen liten, ingen ny databas-tabell om meddelande+taggar räcker.
Merga ingenting och deploya ingenting — öppna en PR och sammanfatta.

---
