import { MDXRemote } from "next-mdx-remote";
import { GetStaticPropsContext, NextPageWithLayout } from "next";
import { Heading, Flex, Box, Text, Link as ChakraLink } from "@chakra-ui/react";
import { Prose } from "@nikolovlazar/chakra-ui-prose";
import NextLink from "next/link";
import Layout from "../../../components/Layout";
import {
  Chapter,
  getChapter,
  getChapterManifest,
  getChapterSlugs,
} from "../../../lib/scaling-book";
import { Content } from "../../../lib/mdx";
import { NextSeo } from "next-seo";

interface ChapterProps {
  chapter: Content<Chapter>;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}

const ChapterPage: NextPageWithLayout<ChapterProps> = ({ chapter, prev, next }) => {
  const { metadata, source } = chapter;
  return (
    <>
      <NextSeo
        title={`${metadata.title} | Scaling Book | Eddie Chen`}
        description={metadata.description || metadata.title}
        openGraph={{
          title: `${metadata.title} | Scaling Book`,
          description: metadata.description || metadata.title,
        }}
      />
      <Box fontSize="0.91em">
        <Flex direction="column" gap={2}>
          <Text fontSize="sm" color="gray.600" my={0}>
            <NextLink href="/writing/scaling-book" passHref legacyBehavior>
              <ChakraLink color="blue.500">Scaling Book</ChakraLink>
            </NextLink>
          </Text>
          <Heading size="lg">{metadata.title}</Heading>
          <Prose>
            <MDXRemote compiledSource={source} scope={{}} frontmatter={{}} />
          </Prose>
          <Flex justify="space-between" mt={8} fontSize="sm">
            <Box>
              {prev && (
                <NextLink href={`/writing/scaling-book/${prev.slug}`} passHref legacyBehavior>
                  <ChakraLink color="blue.500">← {prev.title}</ChakraLink>
                </NextLink>
              )}
            </Box>
            <Box textAlign="right">
              {next && (
                <NextLink href={`/writing/scaling-book/${next.slug}`} passHref legacyBehavior>
                  <ChakraLink color="blue.500">{next.title} →</ChakraLink>
                </NextLink>
              )}
            </Box>
          </Flex>
        </Flex>
      </Box>
    </>
  );
};

export default ChapterPage;

ChapterPage.getLayout = (page) => <Layout>{page}</Layout>;

export async function getStaticPaths() {
  const slugs = getChapterSlugs();
  return {
    paths: slugs.map((slug) => ({ params: { slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }: GetStaticPropsContext) {
  if (!params || typeof params.slug !== "string") {
    return { redirect: { destination: "/writing/scaling-book", permanent: false } };
  }

  const chapter = await getChapter(params.slug);
  if (!chapter) {
    return { redirect: { destination: "/writing/scaling-book", permanent: false } };
  }

  const manifest = getChapterManifest();
  const idx = manifest.findIndex((c) => c.slug === params.slug);
  const prev = idx > 0 ? { slug: manifest[idx - 1].slug, title: manifest[idx - 1].title } : null;
  const next =
    idx >= 0 && idx < manifest.length - 1
      ? { slug: manifest[idx + 1].slug, title: manifest[idx + 1].title }
      : null;

  return { props: { chapter, prev, next } };
}
