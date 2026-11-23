// Decides whether a request came from a crawler, an AI assistant, or some other
// automated client, for middleware.ts to record. Pure functions only, so the
// rules can be tested without a server. Nothing here changes a response.

export interface CrawlerEntry {
  token: string | null;
  operator: string;
  category: string;
  ipRanges?: string | null;
}

export interface RequestFacts {
  ua: string;
  path: string;
  header: (name: string) => string | null;
}

export interface Classification {
  bot: string;
  operator: string;
  category: string;
  reasons: string[];
  /** The operator publishes address ranges, so the address can be checked against them. */
  keepAddress: boolean;
  /** Could be a person's own device: keep no referrer and only a coarse user agent. */
  mayBePerson: boolean;
  /** The user agent to record: in full for declared bots, coarse otherwise. */
  ua: string;
}

// Self-declared automation that is not in the registry. Written so ordinary
// browsers, in-app browsers and phone models (CUBOT NOTE, ROBOT_X) do not match.
const GENERIC_BOT =
  /bot[\/\-;]|\Wbot[)_]|\bbot\b|bot$|telegrambot|twitterbot|crawl|spider|scrap|slurp|headless|python|\bcurl\/|wget|go-http-client|axios|okhttp|java\/|libwww|httpclient|node-fetch|undici|\bnode(?:\.js)?\/|ruby|php\//i;

// Apple's link previews (iMessage, Mail) fetch from the person's own device
// with a user agent naming both facebookexternalhit and Twitterbot.
const APPLE_LINK_PREVIEW = /facebookexternalhit[\s\S]*Twitterbot|Twitterbot[\s\S]*facebookexternalhit/i;

/** Browser family and major version only, e.g. "Chrome/58". */
function coarseAgent(ua: string): string {
  const named = /(Edg|OPR|SamsungBrowser|CriOS|FxiOS|Firefox|Chrome|Chromium)\/(\d+)/.exec(ua);
  if (named) return `${named[1]}/${named[2]}`;
  const safari = /Version\/(\d+)\S* .*Safari/.exec(ua);
  if (safari) return `Safari/${safari[1]}`;
  return ua ? "(other)" : "";
}

// The pages and machine-readable files worth counting; images and other assets are not.
const CONTENT_PATH =
  /^\/(?:$|index\.md$|llms(?:-full)?\.txt$|robots\.txt$|sitemap[\w-]*\.xml$|(?:writing|reading|engineering|resume)(?:[/.]|$))(?!.*\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?)$)/;

/**
 * Signs that a request calling itself a browser was not sent by one. One sign
 * alone is common in real traffic (old Android WebViews, TVs, feature phones,
 * privacy tools), so a request is only counted as suspect with two.
 */
function browserDoubts(ua: string, header: RequestFacts["header"]): string[] {
  const reasons: string[] = [];
  // Every browser on iOS is WebKit, which sends Sec-Fetch-* only since Safari 16.4.
  const ios = /\b(?:iPhone|iPad|iPod)\b|CriOS\/|FxiOS\//.test(ua);
  const chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
  const firefox = /Firefox\/(\d+)/.exec(ua);
  const chromeMajor = chrome ? Number(chrome[1]) : null;
  const firefoxMajor = firefox ? Number(firefox[1]) : null;

  // Chrome 70 and Firefox 60 are from 2018.
  if ((chromeMajor !== null && chromeMajor < 70) || (firefoxMajor !== null && firefoxMajor < 60)) {
    reasons.push("very-old-browser");
  }
  // Chrome 80+ and Firefox 90+ send Sec-Fetch-Mode on every request.
  const sendsFetchMetadata =
    !ios && ((chromeMajor !== null && chromeMajor >= 80) || (firefoxMajor !== null && firefoxMajor >= 90));
  if (sendsFetchMetadata && !header("sec-fetch-mode")) reasons.push("no-sec-fetch");
  // Browsers send Accept-Language.
  if (!header("accept-language")) reasons.push("no-accept-language");
  return reasons;
}

export function makeClassifier(crawlers: CrawlerEntry[]) {
  // Longest token first, so "Diffbot-User" wins over "Diffbot". Entries without
  // a token (Google-Extended, Applebot-Extended) are robots.txt names only.
  const known = crawlers
    .filter((c) => c.token)
    .map((c) => ({ needle: (c.token as string).toLowerCase(), crawler: c }))
    .sort((a, b) => b.needle.length - a.needle.length);

  return function classify({ ua, path, header }: RequestFacts): Classification | null {
    const lower = ua.toLowerCase();
    if (APPLE_LINK_PREVIEW.test(ua)) {
      if (!CONTENT_PATH.test(path)) return null;
      return {
        bot: "(link preview)",
        operator: "",
        category: "link-preview",
        reasons: [],
        keepAddress: false,
        mayBePerson: true,
        ua: "(link preview)",
      };
    }
    const match = known.find(({ needle }) => lower.includes(needle));
    if (match) {
      return {
        bot: match.crawler.token as string,
        operator: match.crawler.operator,
        category: match.crawler.category,
        reasons: [],
        keepAddress: Boolean(match.crawler.ipRanges),
        mayBePerson: false,
        ua: ua.slice(0, 300),
      };
    }
    if (!CONTENT_PATH.test(path)) return null;

    // Agents that sign their requests (RFC 9421) say who they are here,
    // whatever their user agent claims (ChatGPT agent: "https://chatgpt.com").
    const signatureAgent = header("signature-agent");
    if (signatureAgent) {
      return {
        bot: signatureAgent.replace(/"/g, "").slice(0, 80),
        operator: "",
        category: "signed-agent",
        reasons: [],
        keepAddress: false,
        mayBePerson: false,
        ua: ua.slice(0, 300),
      };
    }
    if (ua === "" || GENERIC_BOT.test(ua)) {
      return {
        bot: ua === "" ? "(no user agent)" : ua.split(/[\s/;(]/)[0].slice(0, 40),
        operator: "",
        category: "other-bot",
        reasons: [],
        keepAddress: false,
        mayBePerson: false,
        ua: ua.slice(0, 300),
      };
    }
    const reasons = browserDoubts(ua, header);
    if (reasons.length >= 2) {
      return {
        bot: "(browser-like)",
        operator: "",
        category: "suspected-automation",
        reasons,
        keepAddress: false,
        mayBePerson: true,
        ua: coarseAgent(ua),
      };
    }
    return null;
  };
}
