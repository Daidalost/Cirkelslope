# Cirkelslisken

En Slope-inspireret 3D-kuglebane, hvor man kommer igennem runde portaler og skal
regne omkreds eller areal ud fra cirklens radius, før man kan fortsætte.
Bygget til mellemtrinnet (4.–6. klasse) med π = 3,14.

## Sådan spiller man

| Tast | Handling |
|---|---|
| ◀ / ▶ (eller A / D) | styr kuglen til siderne |
| Mellemrum (eller W / ▲) | hop over huller |
| Mellemrum på slutskærmen | start forfra |

På telefon og tablet vises tre knapper nederst på skærmen i stedet.

Ved hver portal fryser spillet. Du får en cirkel med kendt radius og skal finde
enten omkredsen (`O = 2 · π · r`) eller arealet (`A = π · r²`). Svaret må skrives
med komma eller punktum. Rigtigt svar låser **Fortsæt** op. Er svaret forkert,
får du et målrettet vink — og efter to forsøg vises fremgangsmåden trin for trin.

## Highscore

Der er to lister, og de virker uafhængigt af hinanden:

- **Denne computer** – top 10 gemt i browserens `localStorage`. Virker altid, også
  uden internet og uden nogen opsætning overhovedet.
- **Online** – fælles top 10 for alle der spiller. Kræver en Redis-database
  (se nedenfor). Er den ikke sat op, forsvinder fanen bare, og resten fungerer.

Man bliver kun bedt om sit navn hvis turen faktisk kommer på en af listerne.
Navnet huskes til næste tur. Der rangeres efter meter, og antal klarede portaler
afgør ved dødt løb.

Navne renses både i browseren og på serveren: kun bogstaver, tal og enkelte tegn,
højst 14 tegn, og en blokliste fanger de værste. Navne vises altid via
`textContent`, så et navn aldrig kan blive til kode på de andres skærme.

### Slå den fælles liste til

1. I dit Vercel-projekt: **Storage → Create Database → Marketplace → Upstash for Redis**
   (Vercel KV findes ikke længere; Redis kommer via Marketplace nu). Gratis-planen
   er rigelig — spillet skriver én lille række pr. highscore.
2. Forbind databasen til projektet. Vercel lægger selv miljøvariablerne ind.
3. **Redeploy** projektet — miljøvariabler slår først igennem ved en ny deployment.

`api/scores.js` leder efter disse navne, i denne rækkefølge:

```
KV_REST_API_URL        / KV_REST_API_TOKEN
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
REDIS_REST_URL         / REDIS_REST_TOKEN
```

Hedder din integrations variabler noget helt fjerde, opretter du bare
`KV_REST_API_URL` og `KV_REST_API_TOKEN` manuelt under **Settings → Environment
Variables** med de samme værdier. Du kan tjekke om det virker ved at åbne
`https://<dit-projekt>.vercel.app/api/scores` — den skal svare `{"ok":true,...}`.

### Rydde listen

Alt ligger i ét Redis-nøgle. Slet den fra Upstash-konsollen, eller:

```bash
curl -X POST "$KV_REST_API_URL/pipeline" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  -d '[["DEL","cirkelslisken:scores"]]'
```

## Kør lokalt

Projektet er ren statisk HTML/CSS/JS uden byggetrin og uden npm-afhængigheder.
ES-moduler kræver dog en webserver (de virker ikke via `file://`):

```bash
python3 -m http.server 8000
# eller
npx serve .
```

Åbn derefter http://localhost:8000

Bemærk at `/api/scores` ikke kører med en almindelig statisk server — den lokale
highscore virker, men online-fanen vil være væk. Vil du teste hele kæden lokalt,
brug `vercel dev` i stedet.

## Deploy til Vercel

1. Læg mappen i et Git-repo og push til GitHub/GitLab/Bitbucket.
2. I Vercel: **Add New → Project → Import** repoet.
3. Framework Preset: **Other**. Build Command og Output Directory lades tomme.
4. Deploy.

Eller direkte fra terminalen:

```bash
npm i -g vercel
vercel        # preview
vercel --prod # produktion
```

`vercel.json` sætter kun cache- og sikkerhedsheadere — der køres intet build.

## Filer

```
index.html          markup, HUD og overlays
css/style.css       hele designet
api/scores.js       serverless-endpoint til den fælles highscore
js/highscore.js     lokal top 10 + kald til /api/scores
js/main.js          opstart og fejlhåndtering
js/game.js          fysik, kamera, portallogik, tegneløkke
js/track.js         den procedurelle bane: form, huller, søjler, portaler
js/world.js         baggrundens ringe, planeter og måner + farvepalet
js/questions.js     opgavegenerator, svartjek og fejldiagnose
js/ui.js            menu, opgavepanel, HUD, game over
js/gl.js            lille WebGL2-motor (shaders, mesh, renderer)
js/geometry.js      kugle, torus, cylinder, skive, boks
js/mat.js           matrix- og vektormatematik
js/audio.js         syntetiske lydeffekter (WebAudio, ingen lydfiler)
```

## Justeringer man typisk vil lave

| Hvad | Hvor |
|---|---|
| Sværhedsgrad på matematikken (radier) | `js/questions.js` → `radiusFor()` |
| Omkreds/areal-fordeling | `js/questions.js` → `makeQuestion()` |
| Afstand mellem portaler | `js/track.js` → `PORTAL_SPACING` |
| Fart og hvor hurtigt den stiger | `js/game.js` → `speedAt()` |
| Hoppets højde | `js/game.js` → `JUMP_V` |
| Banens bredde og hældning | `js/track.js` → `halfWidth()`, `height()` |
| Farver | `js/world.js` → `PALETTE` og `css/style.css` → `:root` |
| Antal pladser på highscoren | `js/highscore.js` → `TOP` |
| Blokerede navne | `js/highscore.js` og `api/scores.js` → `BLOCKED` (begge steder) |

## Krav

WebGL2 — understøttes af alle opdaterede versioner af Chrome, Edge, Firefox og
Safari (inkl. iOS 15+). Bedste tur gemmes lokalt i browseren.
