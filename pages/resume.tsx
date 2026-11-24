import fs from "fs";
import path from "path";
import type { ReactNode } from "react";
import { Box, Button, Flex, Heading, Icon } from "@chakra-ui/react";
import { Prose } from "@nikolovlazar/chakra-ui-prose";
import type { NextPageWithLayout } from "next";
import { NextSeo } from "next-seo";
import { MDXRemote } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import { FiDownload } from "react-icons/fi";
import Layout from "../components/Layout";
import { bodyOf } from "../lib/mdx";
import { site } from "../lib/site";

interface ResumeProps {
  title: string;
  source: string;
}

// The resume is content/resume.md, the text of the resume PDF (the build checks
// the two match), shown as a page. A link to a PDF becomes the download button.
function ResumeLink({ href = "", children }: { href?: string; children?: ReactNode }) {
  if (href.endsWith(".pdf")) {
    return (
      <Button
        as="a"
        href={href}
        download
        leftIcon={<Icon as={FiDownload} />}
        colorScheme="blue"
        size="sm"
        // Prose styles every link in the text; keep the button's own look.
        sx={{ "&&": { color: "white", textDecoration: "none" } }}
      >
        {children}
      </Button>
    );
  }
  return <a href={href}>{children}</a>;
}

const Resume: NextPageWithLayout<ResumeProps> = ({ title, source }) => {
  return (
    <>
      <NextSeo
        title="Resume | Eddie Chen"
        description={`Resume for ${site.description}`}
      />
      <Box fontSize="0.91em">
        <Flex direction="column" gap={2}>
          <Heading size="lg">{title}</Heading>
          {/* Post typography, set tighter: a resume is read by scanning. The
              "& " keys add to Prose's own h2/h3/hr styles; plain "h2" keys
              would replace them. */}
          <Prose
            sx={{
              "& hr": { my: 6 },
              "& h2": { fontSize: "1.35em", mt: 0, mb: 3 },
              "& h3": { fontSize: "1.05em", mt: 5, mb: 1 },
              "& h3 + p": { mt: 0 },
            }}
          >
            <MDXRemote
              compiledSource={source}
              scope={{}}
              frontmatter={{}}
              components={{ a: ResumeLink }}
            />
          </Prose>
        </Flex>
      </Box>
    </>
  );
};

export default Resume;

Resume.getLayout = (page) => <Layout>{page}</Layout>;

export async function getStaticProps() {
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "resume.md"), "utf8");
  // The file's own "# " heading becomes the page heading, styled like a post title.
  const body = bodyOf(raw);
  const heading = /^# (.+)\n/m.exec(body);
  const { compiledSource } = await serialize(heading ? body.replace(heading[0], "") : body, {
    mdxOptions: { format: "md", development: false, remarkPlugins: [remarkGfm] },
  });
  return {
    props: { title: heading ? heading[1].trim() : "Resume", source: compiledSource },
  };
}
