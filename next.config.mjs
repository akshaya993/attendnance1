// next.config.mjs
// Build-time configuration for the whole app. Next.js reads this ONCE when the
// server starts, so any change here needs a full restart of `npm run dev` -
// saving the file is not enough.
//
// WHAT THIS FILE DOES TODAY: it attaches a small set of security headers to
// every response, and stops the push service worker from ever being cached.
//
// WHAT IS DELIBERATELY MISSING: a Content-Security-Policy. app/layout.js runs
// an inline script before first paint (it reads the saved theme so the screen
// never flashes white). A naive CSP blocks inline scripts and brings that flash
// back. A correct CSP needs a per-request nonce passed into the layout - that
// is a deployment task, not something to bolt on here.

const securityHeaders = [
  // Stops the browser second-guessing a file's type. Without it, something we
  // serve as plain text could be sniffed and executed as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Refuses to let another website load the portal inside a hidden frame and
  // trick a signed-in parent into clicking something they cannot see.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },

  // Controls what leaks when a user follows a link out of the app. Other sites
  // get our domain and nothing more, so a URL like /parent/child/482 never
  // travels off-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Switches off browser hardware the portal has no business touching.
  // geolocation stays ON for our own pages (self) because Feature 02, the bus
  // tracker, will need the driver's position. Camera, microphone and payment
  // are off for everybody, including us.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), geolocation=(self)",
  },
];

// HTTPS-only, and only in production. On localhost there is no certificate, and
// telling a browser "never speak plain HTTP to this host again" while we are
// still developing is a good way to lock ourselves out of our own machine.
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit reads its built-in font files (.afm) from disk at runtime. Bundling
  // it breaks those paths (the file lookup lands on a phantom C:\ROOT path and
  // every PDF 500s). Declaring it external makes the route load the real
  // package from node_modules, where the data files actually live.
  serverExternalPackages: ["pdfkit"],

  async headers() {
    return [
      {
        // Every page, every API route, every asset.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // public/sw.js is the push service worker. It must never be served from
        // cache: a stale copy would keep running the old notification logic long
        // after we shipped a fix, and the user has no way to clear it by hand.
        // Everything else in public/ can cache normally.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;