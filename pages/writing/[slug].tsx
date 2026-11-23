import { MDXRemote } from "next-mdx-remote";
import { GetStaticPropsContext, NextPageWithLayout } from "next";
import { Heading, Flex, Box } from "@chakra-ui/react";
import { Prose } from "@nikolovlazar/chakra-ui-prose";
import Layout from "../../components/Layout";
import { getAllSlugs, getPost, Post as PostMetadata } from "../../lib/writing";
import { Content } from "../../lib/mdx";
import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { JsonLd } from "../../components/JsonLd";
import { articleJsonLd, pagePath } from "../../lib/site";

interface PostProps {
  post: Content<PostMetadata>;
}

const Post: NextPageWithLayout<PostProps> = ({ post }) => {
  const router = useRouter();
  return (
    <>
      <JsonLd
        id="article-jsonld"
        data={articleJsonLd({
          path: pagePath(router.asPath),
          title: post.metadata.title,
          description: post.metadata.description,
          date: post.metadata.date,
          image: post.metadata.image,
        })}
      />
      <NextSeo
        title={post.metadata.title}
        description={post.metadata.description}
        openGraph={{
          type: "article",
          title: post.metadata.title,
          description: post.metadata.description,
          images: post.metadata.image
            ? [{ url: post.metadata.image }]
            : undefined,
        }}
      />
      <Box fontSize="0.91em">
        <Flex direction="column" gap={2}>
          <Heading size="lg">{post.metadata.title}</Heading>
          <Prose>
            <MDXRemote compiledSource={post.source} scope={{}} frontmatter={{}} />
          </Prose>
        </Flex>
      </Box>
    </>
  );
};

export default Post;

Post.getLayout = (page) => <Layout>{page}</Layout>;

export async function getStaticPaths() {
  const paths = getAllSlugs();

  return {
    paths,
    fallback: false,
  };
}

export async function getStaticProps({ params }: GetStaticPropsContext) {
  if (!params || !params.slug || typeof params.slug !== "string") {
    return { redirect: { destination: "/" } };
  }

  const post = await getPost(params.slug as string);
  if (!post) {
    return { redirect: { destination: "/" } };
  }

  return { props: { post } };
}
