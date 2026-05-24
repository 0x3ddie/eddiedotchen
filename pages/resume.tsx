import { Box, Flex, Heading, Link, Button, Icon, Text } from "@chakra-ui/react";
import type { NextPageWithLayout } from "next";
import Layout from "../components/Layout";
import { NextSeo } from "next-seo";
import { FiDownload } from "react-icons/fi";

const Resume: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo
        title="Resume | Eddie Chen"
        description="Resume for Eddie Chen — Data Science and Supply Chain student at Arizona State University. Projects across transformer inference, on-device AI, ML systems, and applied software."
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
        <Text my={0}>
          Edward Chen — Data Science (BS) and Supply Chain Management (BA) at
          Arizona State University, with a minor in Economics. Selected projects
          include{" "}
          <Link href="https://github.com/0x3ddie/local-turboquant" isExternal color="blue.500">
            local-turboquant
          </Link>{" "}
          (KV-cache compression for transformer inference),{" "}
          <Link href="/engineering" color="blue.500">
            murmur and smarternano
          </Link>
          , and co-founding{" "}
          <Link href="https://www.mymelo.org/" isExternal color="blue.500">
            mymelo.org
          </Link>
          .
        </Text>
        <Text my={0} fontSize="sm" color="gray.600">
          Plain-text mirror:{" "}
          <Link href="/resume.md" color="blue.500" isExternal>
            /resume.md
          </Link>
          . Projects:{" "}
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

