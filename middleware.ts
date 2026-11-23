import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import crawlers from "./lib/ai-crawlers.json";
import { makeClassifier } from "./lib/crawler-classify";

// Measurement only: records which crawlers and assistant fetchers request the
// site's content. It never changes a response. Every visitor, bot or human,
// gets the same bytes; nothing is served by user agent.
//
// What is recorded (see lib/crawler-classify.ts for the rules)
//   - requests from the crawlers named in lib/ai-crawlers.json, with the
//     client address only when the operator publishes its address ranges, so
//     the claim can be checked
//   - other self-declared bots, and requests that claim to be a browser but
//     show two signs of not being one, when they ask for a content page; for
//     the latter no address and no referrer are kept, and only the browser
//     family and major version of the user agent
// Ordinary browser visits, Next's data and prefetch requests, and assets are
// not recorded.
//
// Where it goes
//   - one JSON line per request on stdout (Vercel runtime logs)
//   - the same event to PostHog when POSTHOG_CRAWLER_KEY is set. This is a
//     server-only variable, separate from the browser analytics key, so keeping
//     crawler records never switches on tracking of human visitors.
// AI_CRAWLER_LOG=off stops the recording after a redeploy; deleting this file
// takes the middleware out of the request path entirely.

export const config = {
  // Skip Next's own assets and static media; everything else may be content.
  matcher: [
    "/((?!_next/|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?|ttf|otf|mp4|webm|mov|m4v|mp3|m4a|wav|ogg)$).*)",
  ],
};

const classify = makeClassifier(crawlers);

async function sendToPostHog(event: Record<string, unknown>) {
  const key = process.env.POSTHOG_CRAWLER_KEY;
  if (!key) return;
  const host = process.env.POSTHOG_CRAWLER_HOST || "https://us.i.posthog.com";
  // Give up after three seconds rather than hold the edge function open.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  // PostHog's documented public capture endpoint; the project token is enough.
  await fetch(`${host}/i/v0/e/`, {
    method: "POST",
    signal: controller.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: "crawler_request",
      distinct_id: `crawler:${event.bot}`,
      timestamp: new Date().toISOString(),
      properties: {
        ...event,
        // A crawler is not a person: no profile, and no GeoIP on our edge's IP.
        $process_person_profile: false,
        $geoip_disable: true,
      },
    }),
  }).finally(() => clearTimeout(timer));
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
  try {
    if (process.env.AI_CRAWLER_LOG === "off") return NextResponse.next();
    if (request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.next();
    }
    const headers = request.headers;
    // Next's own data and prefetch requests reach middleware with the page's
    // path; they are not separate visits.
    if (
      headers.get("x-nextjs-data") ||
      headers.get("purpose") === "prefetch" ||
      headers.get("next-router-prefetch")
    ) {
      return NextResponse.next();
    }
    const hit = classify({
      ua: headers.get("user-agent") || "",
      path: request.nextUrl.pathname,
      header: (name) => headers.get(name),
    });
    if (!hit) return NextResponse.next();

    const path = request.nextUrl.pathname;
    const accept = headers.get("accept") || "";
    const record = {
      msg: "crawler_request",
      bot: hit.bot,
      operator: hit.operator,
      category: hit.category,
      reasons: hit.reasons,
      path,
      method: request.method,
      markdown: /\.md$|^\/llms(?:-full)?\.txt$/.test(path) || accept.includes("text/markdown"),
      accept: accept.slice(0, 120),
      referer: hit.mayBePerson ? "" : (headers.get("referer") || "").slice(0, 200),
      country: headers.get("x-vercel-ip-country") || "",
      // TLS fingerprint: stable for one client library whatever user agent it sends.
      ja4: headers.get("x-vercel-ja4-digest") || "",
      // Vercel's own verdict on the bot, when the project's plan forwards it.
      vercelBot: headers.get("x-vercel-bot-name") || headers.get("x-vercel-claimed-bot-name") || "",
      vercelBotStatus: headers.get("x-vercel-bot-status") || "",
      // Agents that sign requests (RFC 9421) name themselves here, whatever their UA says.
      signatureAgent: (headers.get("signature-agent") || "").slice(0, 120),
      // Kept only when the operator publishes address ranges to check it against.
      ip: hit.keepAddress
        ? (request.ip || headers.get("x-real-ip") || headers.get("x-forwarded-for") || "").split(",")[0].trim()
        : "",
      ua: hit.ua,
    };
    console.log(JSON.stringify(record));
    event.waitUntil(sendToPostHog(record).catch(() => {}));
  } catch {
    // Measurement must never take the site down.
  }
  return NextResponse.next();
}
