import { Box, Flex, Heading, Link, Button, Icon, Text } from "@chakra-ui/react";
import type { NextPageWithLayout } from "next";
import Layout from "../components/Layout";
import { NextSeo } from "next-seo";
import { FiDownload } from "react-icons/fi";
import { site } from "../lib/site";

const Resume: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo
        title="Resume | Eddie Chen"
        description={`Resume for ${site.description}`}
      />
      <Flex direction="column" gap={4}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
          <Heading size="lg">Resume</Heading>
          <Link href="/Edward-Chen-Resume.pdf" download isExternal>
            <Button leftIcon={<Icon as={FiDownload} />} colorScheme="blue" size="sm">
              Download PDF
            </Button>
          </Link>
        </Flex>
        <Text my={0} fontSize="sm" color="gray.600">
          Projects:{" "}
          <Link href="/engineering" color="blue.500">
            /engineering
          </Link>
          . Writing:{" "}
          <Link href="/writing" color="blue.500">
            /writing
          </Link>
          .
        </Text>
        <Box
          as="iframe"
          src="/Edward-Chen-Resume.pdf"
          width="100%"
          height="800px"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          title="Edward Chen — Resume PDF"
        />
      </Flex>
    </>
  );
};

export default Resume;

Resume.getLayout = (page) => <Layout>{page}</Layout>;

