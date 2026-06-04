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

// Official Scaling Book chapter titles, verbatim from
// https://jax-ml.github.io/scaling-book/ (table of contents).
// We display the listing using these so the index matches the book.
// The detail page still uses the user's own frontmatter title.
const OFFICIAL_TITLES: Record<number, string> = {
  1: "A Brief Intro to Roofline Analysis",
  2: "How to Think About TPUs",
  3: "Sharded Matrices and How to Multiply Them",
  4: "All the Transformer Math You Need to Know",
  5: "How to Parallelize a Transformer for Training",
  6: "Training LLaMA 3 on TPUs",
  7: "All About Transformer Inference",
  8: "Serving LLaMA 3 on TPUs",
  9: "How to Profile TPU Code",
  10: "Programming TPUs in JAX",
  11: "Conclusions and Further Reading",
  12: "How to Think About GPUs",
};

interface ScalingBookProps {
  chapters: Chapter[];
}

const ScalingBook: NextPageWithLayout<ScalingBookProps> = ({ chapters }) => {
  return (
    <>
      <NextSeo
        title="Scaling Book — Notes & Solutions | Eddie Chen"
        description="My chapter-by-chapter notes and worked problems on the Scaling Book. Synced from my notes vault."
      />
      <Flex direction="column" align="flex-start" gap={4}>
        <Heading size="lg">Scaling Book — Notes & Solutions</Heading>
        <Text my={0}>
          Working through the{" "}
          <ChakraLink
            href="https://jax-ml.github.io/scaling-book/"
            isExternal
            color="blue.500"
          >
            Scaling Book
          </ChakraLink>
          . Each chapter below collects my depth notes alongside worked
          solutions to the chapter problems. Source lives in my{" "}
          <ChakraLink
            href="https://github.com/0x3ddie/notes/tree/main/One/Scaling%20Book"
            isExternal
            color="blue.500"
          >
            notes vault
          </ChakraLink>{" "}
          and is auto-synced here on push.
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
