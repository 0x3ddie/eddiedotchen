import { Html, Head, Main, NextScript } from "next/document";
import { ColorModeScript } from "@chakra-ui/react";
import Script from "next/script";

const profileJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  url: "https://eddiechen.xyz/",
  mainEntity: {
    "@type": "Person",
    name: "Eddie Chen",
    alternateName: "Edward Chen",
    url: "https://eddiechen.xyz/",
    email: "mailto:echen1246@gmail.com",
    affiliation: {
      "@type": "CollegeOrUniversity",
      name: "Arizona State University",
    },
    knowsAbout: [
      "Artificial Intelligence",
      "Machine Learning",
      "Deep Learning",
      "Transformer Inference",
      "KV Cache Compression",
      "On-device AI",
      "ML Systems",
      "Data Science",
      "Economics",
      "Robotics",
      "Software Engineering",
    ],
    sameAs: [
      "https://github.com/0x3ddie",
      "https://twitter.com/ayocheddie",
    ],
  },
};

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="true"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
        />

        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-M61FCSRJR9"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-M61FCSRJR9');
        `}
        </Script>
      </Head>
      <body>
        <ColorModeScript initialColorMode="light" />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
