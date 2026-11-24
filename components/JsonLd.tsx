import Head from "next/head";

/** Renders one schema.org object as JSON-LD in the document head. */
export function JsonLd({ id, data }: { id: string; data: object }) {
  return (
    <Head>
      <script
        key={id}
        type="application/ld+json"
        // "<" is escaped so content can never close the script element.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c"),
        }}
      />
    </Head>
  );
}
