import { defineConfig } from "cf/config";

// Assets-only Worker: the static PWA in ./public, deployed with `cf deploy ./public`.
export default defineConfig({
  worker: {
    name: "simple-to-do",
    compatibilityDate: "2026-11-01",
    domains: ["simple-to-do.davidp.dev"],
  },
});
