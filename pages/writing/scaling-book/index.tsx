import {
  Heading,
  Stack,
  Flex,
  Text,
  Divider,
  Link as ChakraLink,
} from "@chakra-ui/react";
import NextLink from "next/link";
import type { NextPageWithLayout } from "next";
import Layout from "../../../components/Layout";
import { Chapter, getChapterManifest } from "../../../lib/scaling-book";
import { NextSeo } from "next-seo";
import scalingBook from "../../../content/scaling-book.json";

// The page's title, description, intro and the official chapter titles live in
// content/scaling-book.json, which the Markdown twin of this page reads too.
// Official titles are verbatim from https://jax-ml.github.io/scaling-book/
// (table of contents), so the index matches the book; the chapter pages keep
// their own frontmatter titles.
const OFFICIAL_TITLES: Record<string, string> = scalingBook.officialTitles;

interface ScalingBookProps {
  chapters: Chapter[];
}

const ScalingBook: NextPageWithLayout<ScalingBookProps> = ({ chapters }) => {
  return (
    <>
      <NextSeo
        title={`${scalingBook.title} | Eddie Chen`}
        description={scalingBook.description}
      />
      <Flex direction="column" align="flex-start" gap={4}>
        <Heading size="lg">{scalingBook.title}</Heading>
        <Text my={0}>
          {scalingBook.intro.map((part, i) =>
            "href" in part && part.href ? (
              <ChakraLink key={i} href={part.href} isExternal color="blue.500">
                {part.text}
              </ChakraLink>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </Text>

        {chapters.length === 0 ? (
          <Text my={0} color="gray.600" fontSize="sm">
            No chapters published yet — check back soon.
          </Text>
        ) : (
          <Flex direction="column" align="flex-start" width="100%">
            {chapters.map((chapter) => {
              const officialTitle =
                OFFICIAL_TITLES[chapter.order] ?? chapter.title;
              return (
                <Stack key={chapter.slug} width="100%">
                  <NextLink
                    href={`/writing/scaling-book/${chapter.slug}`}
                    passHref
                    legacyBehavior
                  >
                    <ChakraLink _hover={{ textDecoration: "none" }}>
                      <Stack mb={4} width="100%">
                        <Divider margin="8px 0 !important" width="100%" />
                        <Stack>
                          <Heading
                            as="h2"
                            size="md"
                            marginTop="8px !important"
                            mb="0px !important"
                          >
                            Chapter {chapter.order}: {officialTitle}
                          </Heading>
                          {chapter.description && (
                            <Text my={0}>{chapter.description}</Text>
                          )}
                        </Stack>
                      </Stack>
                    </ChakraLink>
                  </NextLink>
                </Stack>
              );
            })}
          </Flex>
        )}
      </Flex>
    </>
  );
};

export default ScalingBook;

ScalingBook.getLayout = (page) => <Layout>{page}</Layout>;

export async function getStaticProps() {
  const chapters = getChapterManifest();
  return { props: { chapters } };
}
