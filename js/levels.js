// Bubble colors (hue, display name, CSS color for the HUD chip)
export const COLORS = [
  { hue: 352, name: 'Red', css: '#ff3b5c' },
  { hue: 28, name: 'Orange', css: '#ff9a2e' },
  { hue: 50, name: 'Yellow', css: '#ffd92e' },
  { hue: 128, name: 'Green', css: '#3fdc5a' },
  { hue: 186, name: 'Aqua', css: '#2fd9e8' },
  { hue: 218, name: 'Blue', css: '#3b7bff' },
  { hue: 272, name: 'Purple', css: '#a050ff' },
  { hue: 318, name: 'Pink', css: '#ff4fc3' },
];

// Background themes: [top, middle, bottom]
export const THEMES = [
  ['#6a5cff', '#b06bff', '#ff8fd6'], // grape candy
  ['#36b7ff', '#6ad5ff', '#b9f3ff'], // sky
  ['#ff6fa8', '#ff9f7a', '#ffd86b'], // sunset
  ['#2bd4b4', '#64e6a8', '#c9ff8a'], // lagoon
  ['#4b3cff', '#8a4dff', '#ff6fd8'], // night party
  ['#ff7ad9', '#c27bff', '#7fc8ff'], // cotton candy
];

/*
  rise:   seconds for a bubble to float from bottom to top (smaller = faster)
  spawn:  seconds between new bubbles
  size:   bubble size multiplier
  burst:  chance a spawn releases 2-3 bubbles at once
  target: index into COLORS -> only that color counts (others boing)
  specials: chance per spawn for each special bubble
*/
export const LEVELS = [
  { name: 'First Bubbles', tip: 'Pop 10 bubbles!', goal: 10, rise: 7.5, spawn: 1.25, size: 1.3, theme: 1 },
  { name: 'Bubble Breeze', tip: 'Pop 15 bubbles!', goal: 15, rise: 6.5, spawn: 1.0, size: 1.2, theme: 0 },
  { name: 'Shiny Stars', tip: 'Gold ⭐ bubbles give bonus points!', goal: 20, rise: 6, spawn: 0.9, size: 1.15, theme: 2, specials: { star: 0.12 } },
  { name: 'Red Only!', tip: 'Pop only the RED bubbles!', goal: 12, rise: 6.5, spawn: 0.8, size: 1.15, theme: 3, target: 0, specials: { star: 0.05 } },
  { name: 'Big Bubbles', tip: 'Big bubbles split into little ones!', goal: 25, rise: 6, spawn: 1.05, size: 1.1, theme: 5, specials: { big: 0.22 } },
  { name: 'Heart Helpers', tip: 'Pop 💖 bubbles to get a heart back!', goal: 25, rise: 5, spawn: 0.75, size: 1.05, theme: 1, burst: 0.12, specials: { heart: 0.06, star: 0.06 } },
  { name: 'Snowflake Slowdown', tip: 'Pop ❄️ bubbles to slow everything down!', goal: 30, rise: 4.4, spawn: 0.65, size: 1.0, theme: 4, burst: 0.15, specials: { snow: 0.07, star: 0.05 } },
  { name: 'Teeny Tiny', tip: 'Tiny bubbles! Look closely!', goal: 25, rise: 5.2, spawn: 0.7, size: 0.75, theme: 2, burst: 0.15, specials: { star: 0.08, heart: 0.04 } },
  { name: 'Blue Only!', tip: 'Pop only the BLUE bubbles!', goal: 20, rise: 4.6, spawn: 0.55, size: 1.0, theme: 0, target: 5, burst: 0.2, specials: { snow: 0.05 } },
  { name: 'Rainbow Magic', tip: '🌈 bubbles pop EVERYTHING!', goal: 45, rise: 4.4, spawn: 0.42, size: 0.95, theme: 5, burst: 0.3, specials: { rainbow: 0.05, star: 0.05 } },
  { name: 'Bubble Storm', tip: 'Here they come!', goal: 45, rise: 3.8, spawn: 0.45, size: 0.95, theme: 3, burst: 0.3, specials: { big: 0.1, heart: 0.04, snow: 0.04, star: 0.05 } },
  { name: 'Bubble Party!', tip: 'The biggest bubble party ever!', goal: 60, rise: 3.4, spawn: 0.38, size: 0.95, theme: 4, burst: 0.35, specials: { big: 0.08, heart: 0.04, snow: 0.04, star: 0.06, rainbow: 0.03 } },
];

// Endless mode gets harder over time (t = seconds played).
export function endlessParams(t) {
  return {
    rise: Math.max(2.5, 6.5 - t * 0.035),
    spawn: Math.max(0.3, 1.0 - t * 0.008),
    size: Math.max(0.78, 1.15 - t * 0.003),
    burst: Math.min(0.4, 0.05 + t * 0.003),
    specials: { star: 0.06, heart: 0.035, snow: 0.04, big: 0.07, rainbow: t > 45 ? 0.025 : 0 },
    theme: Math.floor(t / 40) % THEMES.length,
  };
}

// Endless Immortal: no hearts, swipe to pop. Gets busier, but stays relaxed.
export function immortalParams(t) {
  return {
    rise: Math.max(3.4, 6 - t * 0.02),
    spawn: Math.max(0.22, 0.6 - t * 0.004),
    size: Math.max(0.85, 1.1 - t * 0.002),
    burst: Math.min(0.45, 0.2 + t * 0.003),
    specials: { star: 0.06, big: 0.08, snow: 0.025, rainbow: 0.02 },
    theme: Math.floor(t / 40) % THEMES.length,
  };
}
