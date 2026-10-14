import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The app is a native shell around the live CK Fitness web app, so every web update reaches
 * members instantly with no store review. "CKFitnessApp" in the browser identity tells the web app
 * to hide prices and purchase buttons inside the store apps (see apps/web/src/lib/native.ts).
 */
const config: CapacitorConfig = {
  appId: "com.chardikalafitness.app",
  appName: "Chardikala Fitness",
  webDir: "www",
  server: {
    url: "https://app.chardikalafitness.com",
    cleartext: false,
    errorPath: "error.html",
    // Links to other sites open in Safari instead of inside the app.
    allowNavigation: ["app.chardikalafitness.com", "*.supabase.co"],
  },
  ios: {
    appendUserAgent: "CKFitnessApp",
    // The page fills the whole screen; the web app keeps its own fixed navy strips behind the clock
    // and the home indicator (see globals.css, html[data-native]).
    contentInset: "never",
    backgroundColor: "#1b1b36",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    appendUserAgent: "CKFitnessApp",
    backgroundColor: "#1b1b36",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: { style: "DARK", backgroundColor: "#1b1b36" },
    Keyboard: { resize: "body" },
  },
};

export default config;
