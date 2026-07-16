/* Registers the Conexia PWA service worker (web only). No-op on native. */
import { Platform } from "react-native";

export function registerServiceWorker(): void {
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Inject PWA meta + manifest into <head> once
  try {
    const doc = window.document;
    const head = doc.head;
    const ensure = (selector: string, factory: () => HTMLElement) => {
      if (!doc.querySelector(selector)) head.appendChild(factory());
    };
    ensure('link[rel="manifest"]', () => {
      const el = doc.createElement("link");
      el.rel = "manifest";
      el.href = "/manifest.json";
      return el;
    });
    ensure('meta[name="theme-color"]', () => {
      const el = doc.createElement("meta");
      el.name = "theme-color";
      el.content = "#1F4A4A";
      return el;
    });
    ensure('meta[name="apple-mobile-web-app-capable"]', () => {
      const el = doc.createElement("meta");
      el.name = "apple-mobile-web-app-capable";
      el.content = "yes";
      return el;
    });
    ensure('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
      const el = doc.createElement("meta");
      el.name = "apple-mobile-web-app-status-bar-style";
      el.content = "default";
      return el;
    });
    ensure('meta[name="apple-mobile-web-app-title"]', () => {
      const el = doc.createElement("meta");
      el.name = "apple-mobile-web-app-title";
      el.content = "Conexia";
      return el;
    });
    ensure('link[rel="apple-touch-icon"]', () => {
      const el = doc.createElement("link");
      el.rel = "apple-touch-icon";
      (el as HTMLLinkElement).href = "/assets/images/conexia-logo.png";
      return el;
    });
    ensure('meta[name="description"][data-conexia]', () => {
      const el = doc.createElement("meta");
      el.name = "description";
      el.content = "Conexia CLM — Contract Lifecycle Management enterprise mobile-first SaaS.";
      el.setAttribute("data-conexia", "1");
      return el;
    });
  } catch { /* ignore DOM errors */ }

  // Register the service worker after load to avoid slowing first paint
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => { /* SW registration is best-effort */ });
  });
}
