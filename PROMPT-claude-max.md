# Prompt till Claude MAX: backend för issue-widgeten i Codicent

Kopiera allt under strecket till Claude. Widgeten (klienten) är redan
byggd: den postar JSON till en endpoint med `Authorization: Bearer
<scoped nyckel>` och meddelandetexten `#issue-draft #<projekt>` + JSON
med fälten `project, title, body, page_url, user_agent, created_at,
source`. Ändra inte widgetens format — bygg mottagaren efter det.

---

Du jobbar i codicent-core (befintlig kodbas, följ dess mönster för
API/`#apidef`/`UpdateDataMessage`/`post_message` — välj det som redan
finns för att skapa ett meddelande utifrån, bygg inget parallellt system).

Implementera, i små steg med tester:

1. **Mottagning:** En endpoint som tar emot widgetens POST, validerar
   Bearer-nyckeln mot config i ett Codicent-meddelande taggat
   `#issue-widget-config #<projekt>` (fält: nyckel-id/hemlighet-hash,
   tillåtna projekt, aktiv/avstängd). Avvisa okänd/avstängd nyckel (401)
   och projekt utanför tillåtlistan (403). Begränsa titel ≤ 200 tecken,
   body ≤ 5 000 tecken. Rate limit per nyckel, t.ex. 10 anrop/timme (429).
2. **Spara som utkast:** Skapa meddelandet exakt med taggarna
   `#issue-draft #<projekt>` och JSON-texten oförändrad, så det syns i
   befintliga vyer. Returnera `{ id }`. Skapa **aldrig** GitHub-issue här.
3. **Transform vid godkännande:** En separat, explicit åtgärd (knapp/
   kommando i Codicent, kräver inloggad granskare) som läser ett
   `#issue-draft`-meddelande, skapar ett GitHub-issue i projektets repo
   (repo-mappning också i config-meddelandet, GitHub-token bara på
   servern), postar tillbaka issue-länken som svar/taggar meddelandet
   `#issue-created`, och är idempotent (kör aldrig två gånger på samma
   meddelande).
4. **Tester:** giltig nyckel → utkast skapas; fel/avstängd nyckel → 401;
   otillåtet projekt → 403; för lång body → 400; transform skapar exakt
   ett issue och andra anropet är en no-op.

Håll diffen liten, ingen ny databas-tabell om meddelande+taggar räcker.
Merga ingenting och deploya ingenting — öppna en PR och sammanfatta.

---
