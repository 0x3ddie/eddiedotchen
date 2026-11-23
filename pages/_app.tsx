import type { AppProps } from "next/app";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import { Prose, withProse } from "@nikolovlazar/chakra-ui-prose";
import Layout from "../components/Layout";
import { ReactElement } from "react";
import { DefaultSeo } from "next-seo";
import Head from "next/head";
import posthog from "posthog-js";
import React from "react";
import { useRouter } from "next/router";
import { Lora } from "@next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "katex/dist/katex.min.css";
import { JsonLd } from "../components/JsonLd";
import {
  absoluteUrl,
  pagePath,
  profileJsonLd,
  site,
  twinFor,
} from "../lib/site";

const lora = Lora({ subsets: ["latin"], display: "swap" });

const theme = extendTheme(
  {
    fonts: {
      heading: lora.style.fontFamily,
      body: lora.style.fontFamily,
    },
  },
  withProse({
    baseStyle: {
      "h1, h2, h3, h4, h5, h6": {
        mt: 4,
        mb: 4,
      },
      p: {
        my: 3,
      },
      a: {
        color: "blue.500",
        _focus: {
          boxShadow: "none !important",
        },
      },
    },
  })
);

const getDefaultLayout = (page: ReactElement) => (
  <Layout>
    <Prose>{page}</Prose>
  </Layout>
);

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const getLayout = Component.getLayout || getDefaultLayout;

  // Each page is its own canonical URL. The 404 page has none.
  const path = pagePath(router.asPath);
  const canonical =
    router.pathname === "/404" ? undefined : absoluteUrl(path);
  const twin = twinFor(router.pathname, router.asPath);

  React.useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_API_KEY || "", {
      api_host: "https://app.posthog.com",
    });

    const handleRouteChange = () => posthog.capture("$pageview");
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, []);

  return (
    <ChakraProvider theme={theme}>
      <DefaultSeo
        title={site.name}
        description={site.description}
        canonical={canonical}
        openGraph={{
          type: "website",
          url: canonical,
          title: site.name,
          description: site.description,
          siteName: site.name,
        }}
        twitter={{
          handle: site.twitterHandle,
          site: site.twitterHandle,
          cardType: "summary",
        }}
      />
      {twin && (
        <Head>
          {/* The same page as Markdown, generated from the same source, and
              the index that lists every such file (llmstxt.org). */}
          <link
            key="markdown-twin"
            rel="alternate"
            type="text/markdown"
            href={absoluteUrl(twin)}
            title="Markdown version of this page"
          />
          <link
            key="llms-txt"
            rel="describedby"
            type="text/plain"
            href={absoluteUrl("/llms.txt")}
            title="llms.txt"
          />
        </Head>
      )}
      {router.pathname === "/" && (
        <JsonLd id="profile-jsonld" data={profileJsonLd()} />
      )}
      {getLayout(<Component {...pageProps} />)}
      <Analytics />
    </ChakraProvider>
  );
}
