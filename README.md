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

## Kør lokalt

Projektet er ren statisk HTML/CSS/JS uden byggetrin og uden npm-afhængigheder.
ES-moduler kræver dog en webserver (de virker ikke via `file://`):

```bash
python3 -m http.server 8000
# eller
npx serve .
```

Åbn derefter http://localhost:8000

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

## Krav

WebGL2 — understøttes af alle opdaterede versioner af Chrome, Edge, Firefox og
Safari (inkl. iOS 15+). Bedste tur gemmes lokalt i browseren.
