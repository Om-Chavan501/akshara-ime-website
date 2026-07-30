import type { APIRoute } from "astro";

/**
 * Generated rather than kept as a static file, so it cannot silently go stale the way a
 * hand-maintained list does the first time someone adds a page and forgets.
 *
 * Deliberately excludes `/account` and `/admin`: both are `noindex`, one is signed-in and the
 * other is the support console. Listing a page in a sitemap while asking robots not to index
 * it is a contradiction, and crawlers report it as one.
 */
const PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/help", priority: "0.8", changefreq: "monthly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/refund", priority: "0.3", changefreq: "yearly" },
];

export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL("https://akshara-ime.com")).origin;
  const urls = PAGES.map(
    ({ path, priority, changefreq }) => `  <url>
    <loc>${base}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  ).join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
