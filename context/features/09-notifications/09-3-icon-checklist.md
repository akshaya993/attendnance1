# 09-3 — ICON CHECKLIST

STATUS: **NOT DONE — deliberately deferred.**
Decided 11 Aug 2026: the logo is being redesigned, so shipping icon work twice
would be wasted effort. Do everything on this page in ONE sitting once the final
logo exists. Nothing else in Feature 09 depends on it.

WHAT IS WRONG RIGHT NOW (all three are cosmetic, none break the app):
1. There is exactly one icon file, `public/icon-512.png`. Despite the name it is
   really 1024x1024 pixels, and `manifest.json` honestly declares `1024x1024`.
2. There is no "maskable" icon, so on Android the logo gets cropped by whatever
   shape the phone uses (circle, squircle, rounded square).
3. `public/sw.js` uses that same big icon as the notification "badge" — the tiny
   monochrome shape in the phone's status bar. It will look like a grey blob.

---

## PART A — IN PLAIN ENGLISH

Think of it like printing your school crest for three different jobs.

**Job 1 — the app icon on the home screen.**
Phones want a small copy and a large copy so they can pick the right one instead
of shrinking a huge image badly. You need a 192-pixel square and a 512-pixel
square. Same logo, two sizes.

**Job 2 — the Android "safe zone" copy.**
Android does not show your square. It cuts a shape out of it — a circle on some
phones, a rounded square on others. If your logo fills the whole square, the
edges get chopped off. So you make a third copy where the logo sits in the
middle at about 80% size, with a solid coloured background filling the rest.
Android then cuts its shape out of that padding instead of your logo. This copy
is called "maskable" — it just means "safe to cut".

**Job 3 — the tiny status-bar badge.**
When a notification arrives on Android, a very small symbol appears in the
status bar at the top of the screen. Android throws away all colour and keeps
only the shape, painting it solid white. A detailed full-colour logo becomes an
unreadable smudge. So this needs a simple, bold, single-shape version — a
silhouette, not the full crest.

**Why nobody notices this today:** you are testing in a desktop browser, which
uses the big icon for everything and never crops it. All three problems only
appear on a real phone.

**What to do with the finished images:** drop them into the `public` folder.
That folder is served straight to the browser as-is, and the app is already
configured to let image files through without a login. Then two small text files
have to be told the new names exist.

---

## PART B — THE TECHNICAL STEPS

### B1. Produce three PNG files

| File | Size | Notes |
|---|---|---|
| `public/icon-192.png` | 192x192 | plain logo, transparent or solid background |
| `public/icon-512.png` | 512x512 | plain logo — REPLACES the current 1024x1024 file |
| `public/icon-maskable.png` | 512x512 | logo at ~80% centred, SOLID background, NO transparency |

Making the maskable one in MS Paint:
1. Open the logo, `Ctrl+E` (Resize) → Pixels → 410 x 410 → OK
2. `Ctrl+A`, `Ctrl+C`
3. File → New, `Ctrl+E` → Pixels → 512 x 512
4. Fill the whole canvas with the brand background (`#0a0a0b`) using the paint bucket
5. `Ctrl+V`, drag the pasted logo to the centre
6. Save As → PNG → `icon-maskable.png`

Easier alternative: upload the logo to `maskable.app/editor` and export.

Optional but recommended: also replace `app/favicon.ico` (the browser tab icon)
and add `public/apple-touch-icon.png` at 180x180 — see B4.

### B2. Rewrite the icons array in `public/manifest.json`

Replace the single-entry `icons` array with:
"icons": [
{ "src": "/icon-192.png",      "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "/icon-512.png",      "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]

Leave every other key in that file alone. `background_color` and `theme_color`
are already `#0a0a0b` and match the dark design token.

### B3. Fix the badge in `public/sw.js`

Inside the `push` event handler, the options object currently reads:

​
icon: "/icon-512.png",
badge: "/icon-512.png",

`icon` is correct — that is the large picture inside the notification.
`badge` must point at the simple silhouette. Either add a fourth PNG
(`public/badge-96.png`, 96x96, single solid shape on transparent) and use it, or
accept the smudge and record that choice here. This is tracked as defect 30.

### B4. iPhone only — Safari ignores manifest icons

iOS does not read `manifest.json` for the home-screen icon. It needs an explicit
link tag. Add to the `<head>` in `app/layout.js`:

​
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />

with a 180x180 PNG at `public/apple-touch-icon.png`. Without it, iOS renders a
blurry screenshot of the page instead of the logo.

### B5. Do NOT touch proxy.js

`proxy.js` already excludes `png` and `manifest.json` from the login check by
file extension, so new image files are public automatically. Adding them to
`PUBLIC_PAGES` would be wrong and is not needed.

---

## PART C — HOW TO CHECK IT WORKED

1. Restart the dev server, then hard-reload the browser (`Ctrl + Shift + R`).
   Manifests and icons are cached hard; a normal reload will show the old ones.

2. Confirm all three files are reachable — paste into the DevTools Console,
   expect three lines all saying `200`:

​
["/icon-192.png","/icon-512.png","/icon-maskable.png"].forEach(p => fetch(p).then(r => console.log(p + " -> " + r.status)))

3. Confirm the manifest is being read — expect the three entries printed back:

​
fetch('/manifest.json').then(r => r.json()).then(d => d.icons.forEach(i => console.log(i.src + " | " + i.sizes + " | " + i.purpose)))

4. Real device check (the only one that truly proves it): install the app on an
   Android phone, look at the home-screen icon shape, then send yourself an
   urgent broadcast and look at the small symbol in the status bar.

---

## RELATED

- Defect 25: icon sizes — this file.
- Defect 30: `sw.js` badge — section B3.
- Defect 31: iPhone install instructions for parents — section B4 plus the
  onboarding copy still to be written.