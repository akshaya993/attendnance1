// app/layout.js
// App shell — created in Feature 13.
// Owns: <html data-theme>, page metadata, the top bar, the theme toggle.
// Feature 09 mounts <BellMenu/> and feature 11 mounts <ProfileIcon/> into
// the same <header> below. Do NOT recreate this file in a later feature.

import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Greenwood School",
  description: "Greenwood High School portal",
};

export const viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

// Runs before the browser paints anything, so a light-theme user never
// sees a dark flash (and vice versa). Must stay tiny and synchronous.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="label-micro">GREENWOOD / PORTAL</span>
          <ThemeToggle />
        </header>

        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}