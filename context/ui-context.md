# UI CONTEXT
## School App - Design System & UX Rules ("Veritas Editorial" - FINAL)

> CONTEXT FILE 4 of 6. The design direction is LOCKED: Option A - editorial dark,
> serif headings, monospace labels, luxury-institution feel - for ALL roles,
> with a built-in light/dark theme system (moon toggle).

## Design philosophy

Premium, editorial, institutional - like the digital portal of a prestigious
academy. Serif display headings, monospace micro-labels, thin borders, generous
spacing, near-black surfaces. Calm and confident, never flashy. Must stay smooth
and readable on a Rs 7,000 Android phone.

## THEME SYSTEM (critical - read before writing ANY component)

1. **NEVER hardcode colors in components.** No `bg-[#131316]`, no `text-[#e7e5e0]`
   in JSX. ALL colors come from CSS variables defined ONCE in `app/globals.css`
   and and declared via @theme in app/globals.css as semantic names (Tailwind v4 CSS-first - NO tailwind.config.js) (`bg-surface`, `text-body`,
   `border-line`, `text-muted`, `bg-page`, etc.).
2. Themes switch via `data-theme="dark" | "light"` on the `<html>` element.
   **Dark is the default.**
3. A moon/sun toggle button sits in the top bar of every logged-in layout.
   On click: swap `data-theme`, save choice to `localStorage('theme')`.
   A tiny inline script in the root layout reads localStorage BEFORE paint
   (prevents flash of wrong theme).
4. The toggle mechanism (variables + toggle component) is created ONCE in the
   app shell (feature 13's layout work). After that, every screen built with
   semantic tokens is AUTOMATICALLY theme-compatible - zero extra work.

## Color tokens

| Token (CSS var) | DARK (default) | LIGHT ("Paper") |
|---|---|---|
| --bg-page | #0a0a0b | #faf9f6 |
| --bg-surface (cards/sidebar) | #131316 | #ffffff |
| --bg-raised (active nav, hover) | #1a1a1e | #f1efe9 |
| --border-line | #232326 | #e7e4da |
| --border-soft (row dividers) | #1c1c20 | #f2f0e9 |
| --text-body | #e7e5e0 | #1c1b18 |
| --text-muted | #8a8a90 | #6d6a60 |
| --cta-bg | #f5f4f1 | #1c1b18 |
| --cta-text | #0a0a0b | #faf9f6 |
| --ok / --ok-soft | #4ade80 / rgba(34,197,94,.12) | #166534 / #e4f5e9 |
| --danger / --danger-soft | #f87171 / rgba(239,68,68,.12) | #b91c1c / #fde4e4 |
| --warn / --warn-soft | #fbbf24 / rgba(245,158,11,.12) | #92600a / #fdf3dd |

Status semantics everywhere: ok=present/paid/approved, danger=absent/due/rejected,
warn=late/half-day/pending, muted=inactive/archived.

## Typography

- **Display/headings (h1-h3, stat numbers, card titles):** serif stack:
  `Georgia, 'Times New Roman', serif`, medium weight, tight letter-spacing.
- **Body/UI:** system sans stack (no font downloads):
  `-apple-system, 'Segoe UI', Roboto, sans-serif`, text-sm/base.
- **Micro-labels (breadcrumbs, table headers, roll numbers, pills, section tags):**
  monospace stack `ui-monospace, Consolas, monospace`, 9-11px, UPPERCASE,
  letter-spacing .12-.18em, muted color.
- This three-font-role system IS the brand. Apply it consistently on every screen.

## Component patterns (match these exactly)

- **Cards/surfaces:** bg-surface, 1px border-line, rounded-xl (12px), padding 16-18px.
- **Status edge:** list rows and stat cards carry a 3px LEFT border in the status
  color (e.g. absent row = danger edge + faint danger background tint).
- **Stat cards:** mono uppercase label on top, big serif number below, tiny muted
  caption. Left accent border 3px.
- **Pills/badges:** uppercase mono 9.5px bold, padding 4px 10px, rounded-full,
  soft status background + status text color + 1px status border (dark theme).
- **Primary CTA:** bg-cta (near-white on dark), cta-text, bold mono UPPERCASE
  label with a trailing arrow, rounded-lg, padding ~11px 22px. One primary CTA
  per screen.
- **Sidebar (desktop) / bottom tabs (mobile):** bg-surface with border-line
  divider; active item = bg-raised + full text color + 1px border; inactive =
  muted text. Brand name in serif + role name as mono micro-label under it.
- **Breadcrumb:** mono micro-label at top of every page ('PORTAL / ATTENDANCE').
- **Page header:** serif title 28-32px + one-line muted description.
- **Avatars:** rounded-full, bg-raised, mono initials/roll number.
- **Tables (admin desktop):** mono uppercase column headers, border-soft row
  dividers, generous row height.

## Hard UX rules (unchanged)

1. MOBILE-FIRST (~360px first); desktop is the enhancement (admin gets most
   desktop attention). Bottom tab bar on mobile, sidebar on desktop.
2. Minimal client JS: server-render everything possible.
3. Animations: CSS transitions only, 150-250ms ease-out, on hover/press/appear.
   NO animation libraries.
4. Touch targets >= 44px; numeric keyboards (inputmode) for phone/amount fields;
   labels always visible; errors inline under fields.
5. Contrast: because default theme is dark, respect the light theme too - users
   in bright sunlight will use the moon toggle. Never remove the toggle.
6. Money/destructive actions ALWAYS get a serif confirm dialog stating exactly
   what will happen ('Record payment of Rs 5,000 for Aarav Reddy - Term 1?').
7. Every list screen: loading skeleton, empty state (helpful one-liner), error
   state with retry.
8. Currency 'Rs 12,500.00'; dates '26 Jul 2026'; IST everywhere.
9. Parent app: child switcher at top when family has multiple children.

## PWA (added with feature 09)

manifest.json: name 'Greenwood School', standalone display, theme_color #0a0a0b,
background_color #0a0a0b, icons 192/512. Service worker for web-push. The app must
remain fully usable as a normal website too.
