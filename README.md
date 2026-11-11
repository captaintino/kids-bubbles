# Bubble Pop Party 🫧

A shiny, colorful bubble-popping game for kids, built for phones and tablets.
Bubbles float up from the bottom of the screen. Tap them to pop them before they float away!

It's an installable **Progressive Web App**: once it has loaded, it works fully offline.

## Modes

- **Levels**: 12 levels. Each new level adds something to learn:
  - ⭐ gold star bubbles give bonus points
  - 🎨 "Pop only RED/BLUE" color levels (other colors just boing)
  - big bubbles that split into little ones
  - 💖 heart bubbles that give a life back
  - ❄️ snowflake bubbles that slow everything down
  - 🌈 rainbow bubbles that pop every bubble on the screen
  
  You get up to 3 stars per level (lose no hearts for 3 stars). Finishing a level unlocks the next one.
- **Endless**: bubbles keep coming faster and faster. Try to beat your best score!
- **Endless Immortal**: a relaxed mode with no hearts, so you can't lose. Drag your finger around to pop every bubble it touches, leaving a sparkly trail. Use the pause button to stop. It keeps its own best score.

**Themes:** pick a world for the background: Bubble Party (its colors change by level), Under the Sea,
Wild West, Knights & Castles, or Outer Space. Each one has a few moving details (fish, a tumbleweed,
waving flags, a rocket...).

You have 5 hearts. A bubble that floats away costs one heart. Progress, best score and the
sound setting are saved on the device.

## Tech

- No build step and no dependencies: plain HTML, CSS and ES modules.
- Rendered on a `<canvas>`. Bubble sprites are drawn once at startup, so the game runs smoothly on phones.
- All sounds are made live with the Web Audio API, so there are no audio files.
- The [Fredoka](https://github.com/hafontia/Fredoka-One) font is included in `fonts/` (SIL Open Font License), so it works offline.
- `sw.js` caches every file the first time the game loads.
- Built to run fast on older tablets. Each world is painted once and then copied to the screen every
  frame, and particles and text are pre-drawn images. If frames still come in slowly, the game lowers
  its resolution and effects by itself.
- Works back to iOS 12 / Safari 12 (e.g. the original iPad Air): touch-event fallback when Pointer Events
  are missing, and no newer JS/CSS syntax (`??`, `?.`, `clamp()`, flex `gap`, `inset`, `aspect-ratio`).

## Hosting on GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then pick the branch and the `/ (root)` folder.
3. The game will be published at `https://<user>.github.io/kids-bubbles/`.

Every path is relative, so the game works from a subfolder like this. Pages serves it over HTTPS,
which service workers need.

**Installing it:** open the page on your phone.
- Android/Chrome: tap the **Install** button on the title screen, or use *Add to Home screen* in the menu.
- iPhone/iPad: tap the **Install** button on the title screen for step-by-step instructions (Share, then **Add to Home Screen**). iOS has no install prompt that a web page can trigger. The button is hidden while running as the installed app.

### Updating

When you change any file, raise `VERSION` in `sw.js` (for example `v1` to `v2`).
Installed copies will then download the new files. If you add a new file, add it to the `ASSETS` list in `sw.js` too.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Service workers work on `localhost` without HTTPS.
