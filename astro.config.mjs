// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://akshara-ime.com",
  integrations: [react()],
  // Static output: this is a marketing site plus a few client-rendered account pages, and
  // everything dynamic (auth, licences, the demo) goes through Supabase edge functions from
  // the browser. No server means GitHub Pages keeps working and there is nothing to run.
  output: "static",
  build: { format: "file" },   // /terms.html rather than /terms/index.html — keeps old URLs alive
  vite: {
    build: { cssMinify: "lightningcss" },
  },
});
