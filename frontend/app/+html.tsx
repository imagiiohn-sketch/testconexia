// @ts-nocheck
/**
 * Conexia CLM — Expo Router web HTML template.
 * Injects PWA manifest, icons, theme-color, iOS meta tags AND registers
 * the service worker at page load — required so Chrome/Edge surface the
 * "Install" button in the address bar when built and deployed.
 * Applied ONLY on the web platform by Expo Router.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const SW_REGISTER_SCRIPT = `
(function () {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  var EXPECTED_VERSION = 'v4';
  window.addEventListener('load', function () {
    // Force fetch latest sw.js from network (bypass HTTP cache)
    navigator.serviceWorker
      .register('/sw.js?v=' + EXPECTED_VERSION, { scope: '/', updateViaCache: 'none' })
      .then(function (reg) {
        if (!reg) return;
        // If a new SW is waiting, activate it and reload once
        function activateWaiting() {
          if (reg.waiting) {
            reg.waiting.postMessage && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
        activateWaiting();
        reg.addEventListener && reg.addEventListener('updatefound', function () {
          var installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', function () {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // A new SW is ready — reload once to hand over control
              window.location.reload();
            }
          });
        });
        reg.update && reg.update().catch(function(){});
      })
      .catch(function () { /* best-effort */ });

    // Detect a controller change (new SW took control) and reload for the user
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__conexiaInstallPrompt = e;
  });
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>Conexia CLM · Contract Lifecycle Management</title>
        <meta
          name="description"
          content="Conexia CLM — Enterprise Contract Lifecycle Management. Contratos, evidencias en campo, workflows y KPIs financieros en móvil y web."
        />

        {/* PWA core */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1F4A4A" />
        <meta name="background-color" content="#FFFFFF" />
        <meta name="application-name" content="Conexia CLM" />

        {/* iOS / Safari — Add to Home Screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Conexia" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />

        {/* Windows tile */}
        <meta name="msapplication-TileColor" content="#1F4A4A" />
        <meta name="msapplication-TileImage" content="/icon-512.png" />

        {/* Favicons */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="shortcut icon" href="/icon-192.png" />

        {/* Open Graph */}
        <meta property="og:title" content="Conexia CLM" />
        <meta property="og:description" content="Enterprise Contract Lifecycle Management" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/icon-512.png" />

        <ScrollViewStyleReset />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />

        {/* Register the service worker at page load — REQUIRED for browser Install button */}
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
