# Cirkelslisken

En Slope-inspireret 3D-kuglebane, hvor man kommer igennem runde portaler og skal
regne omkreds eller areal af en figur ud, før man kan fortsætte: cirkler,
kvadrater, rektangler, parallelogrammer og trekanter.
Bygget til mellemtrinnet (4.–6. klasse) med π = 3,14.

## Sådan spiller man

| Tast | Handling |
|---|---|
| ◀ / ▶ (eller A / D) | styr kuglen til siderne |
| Mellemrum (eller W / ▲) | hop over huller |
| Mellemrum på slutskærmen | start forfra |

På telefon og tablet vises tre knapper nederst på skærmen i stedet.

Slisken er tre kørebaner bred. Kører man ud over kanten, falder man af. Kuglen
følger banens sving af sig selv, så den bliver liggende i sin bane, når man ikke
rører tasterne. Slisken bliver stejlere de første 2600 m og holder derefter en
hældning på ca. 15°. Banen er massiv: er kuglen først faldet ned under kørefladen,
kan den ikke køre ind gennem siden af banen — men ligger den kun lidt under kanten,
kan den nå op igen.

Undervejs møder man:

- **Huller** tværs over hele banen. Hopper man ikke, falder man i, og turen er slut.
  Når et hop lige akkurat kanten på den anden side, bliver kuglen løftet op på den.
  Er hoppet for kort, rammer kuglen hullets forkant og falder ned langs den — den
  kører ikke igennem banen.
- **Brudte kørebaner** — strækninger på 35–65 m hvor en eller to af de tre baner
  mangler. Fænomenet begynder efter anden portal og bliver hyppigere jo længere
  man kommer; til sidst er der steder med kun én bane tilbage. Lysende tværbjælker
  markerer præcis hvor en bane slipper op. Der står aldrig røde søjler i et brud.
- **Røde søjler** som ikke kan hoppes over — dem skal man styre udenom.
- **Ildringe** der svæver over banen. Hopper man igennem, giver det 40 meter ekstra.
  Ruller man bare under dem, sker der ingenting.
- **Pickups** — glødende kugler med en ring om, som man fanger ved at køre igennem dem:

  | Pickup | Farve | Virkning |
  |---|---|---|
  | Turbo | gul | 45 % mere fart i 5 sekunder (bredere synsfelt) |
  | Bullet time | blå | verden kører i 45 % fart i 5 sekunder — mere tid til at reagere |
  | Lav tyngde | lyserød | 42 % tyngdekraft i 6 sekunder — hop næsten 2½ gang så højt |

  Aktive effekter vises med en bjælke der tæller ned under HUD'en. Fanger man den
  samme igen, starter tiden forfra. Tiden står stille mens man regner ved en portal.
- **Alternative baner** — nogle steder deler banen sig. En rampe i én af kørebanerne
  fører enten **op** til et dæk over grundbanen eller **ned** til et dæk under den.
  Det alternative dæk har sin egen farve (blågrøn med lyserøde kanter) og altid en
  pickup og en ildring som belønning.
  - *Dækket over* ender med en kant — man falder ned på grundbanen og kører videre.
  - *Dækket under* stiger op igen i fuld bredde. Grundbanen ovenover slipper op lige
    før, så dem der blev oppe, lander på rampen og kører med op.

  Kører man fra siden ind under rampen op, bliver man nede på grundbanen — man kan
  ikke falde i en fælde.

### Portalerne

Ved hver portal fryser spillet. Du får en figur med mål og skal finde enten
omkredsen eller arealet:

| Figur | Omkreds | Areal |
|---|---|---|
| Cirkel | `O = 2 · π · r` (eller `π · d`) | `A = π · r²` |
| Kvadrat | `O = 4 · s` | `A = s · s` |
| Rektangel | `O = 2 · l + 2 · b` | `A = l · b` |
| Parallelogram | `O = 2 · g + 2 · s` | `A = g · h` |
| Trekant | `O = a + b + c` | `A = ½ · g · h` |

Portalerne ligger ca. 1000 m fra hinanden, så man kommer i flow imellem dem.
Første portal bruger kun cirkler, kvadrater og rektangler med små tal.
Derefter kommer parallelogrammer og trekanter med, og fra fjerde portal bliver tallene
større — cirkler kan få diameteren i stedet for radius, og trekanter viser også de
skrå sider, så man selv skal vælge højden. Samme figur kommer aldrig to gange i træk.
Alle mål er hele centimeter, og trekanterne er valgt så alle sider går op.

Svaret må skrives med komma eller punktum. Man har **tre forsøg**, vist som tre prikker:

1. Første forkerte svar giver et målrettet vink om den fejl, man sandsynligvis har
   lavet — fx *"Du har ganget med den skrå side. Brug højden h …"*.
2. Andet forkerte svar giver første trin af udregningen og en advarsel: *Sidste forsøg!*
3. Tredje forkerte svar viser hele løsningen, og turen slutter.

Et svar der ikke er et tal, koster ikke et forsøg. Når man trykker **Fortsæt**, kører
kuglen videre med præcis den placering, retning og fart den havde — også midt i et hop.

## Highscore

Der er to lister, og de virker uafhængigt af hinanden:

- **Denne computer** – top 10 gemt i browserens `localStorage`. Virker altid, også
  uden internet og uden nogen opsætning overhovedet.
- **Online** – fælles top 10 for alle der spiller. Kræver en Redis-database
  (se nedenfor). Er den ikke sat op, forsvinder fanen bare, og resten fungerer.

Man bliver kun bedt om sit navn hvis turen faktisk kommer på en af listerne.
Navnet huskes til næste tur. Der rangeres efter meter, og antal klarede portaler
afgør ved dødt løb. Bonussen fra ildringene tæller med i meterne, så det kan
betale sig at hoppe efter dem.

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
js/game.js          fysik, kamera, portaler, pickups, tegneløkke
js/track.js         den procedurelle bane: form, huller, søjler, dæk, portaler
js/world.js         baggrundens ringe, planeter og måner + farvepalet
js/questions.js     opgavegenerator (fem figurer), svartjek og fejldiagnose
js/figures.js       SVG-tegningerne af figurerne med mål
js/ui.js            menu, opgavepanel, HUD, effekter, game over
js/gl.js            lille WebGL2-motor (shaders, mesh, renderer)
js/geometry.js      kugle, torus, cylinder, skive, boks
js/mat.js           matrix- og vektormatematik
js/audio.js         syntetiske lydeffekter (WebAudio, ingen lydfiler)
```

## Justeringer man typisk vil lave

| Hvad | Hvor |
|---|---|
| Hvilke figurer der kommer hvornår | `js/questions.js` → `makeQuestion()`, `levelFor()` |
| Talstørrelser pr. figur | `js/questions.js` → `cirkel()`, `kvadrat()` osv. |
| Trekanter med hele sider | `js/questions.js` → `TRI_EASY`, `TRI_HARD` |
| Antal forsøg ved portalen | `js/questions.js` → `MAX_TRIES` |
| Pickups: varighed og styrke | `js/game.js` → `FX_DURATION`, `TURBO_SCALE`, `BULLET_SCALE`, `LOWG_SCALE` |
| Hvor tit der kommer pickups | `js/track.js` → `ensureFeatures()`, afsnit 7 |
| Alternative dæk: højde, rampe, hyppighed | `js/track.js` → `ALT_OFFSET`, `ALT_RAMP`, afsnit 2 |
| Afstand mellem portaler | `js/track.js` → `PORTAL_SPACING` |
| Fart og hvor hurtigt den stiger | `js/game.js` → `speedAt()` |
| Hoppets højde | `js/game.js` → `JUMP_V` |
| Hvor tit kørebaner brydes | `js/track.js` → `ensureFeatures()`, afsnit 3 |
| Hvor tidligt brud begynder | `js/track.js` → `nextLaneZ` i konstruktøren |
| Ildringenes tæthed og bonus | `js/track.js` → afsnit 6 og `HOOP_BONUS` |
| Ildringenes højde og størrelse | `js/track.js` → `HOOP_Y`, `HOOP_R` |
| Hullernes længde og hyppighed | `js/track.js` → `ensureFeatures()`, afsnit 4 |
| Banens bredde og hældning | `js/track.js` → `halfWidth()`, `height()`, `SLOPE_CAP_Z` |
| Farver | `js/world.js` → `PALETTE` og `css/style.css` → `:root` |
| Antal pladser på highscoren | `js/highscore.js` → `TOP` |
| Blokerede navne | `js/highscore.js` og `api/scores.js` → `BLOCKED` (begge steder) |

## Krav

WebGL2 — understøttes af alle opdaterede versioner af Chrome, Edge, Firefox og
Safari (inkl. iOS 15+). Bedste tur gemmes lokalt i browseren.
