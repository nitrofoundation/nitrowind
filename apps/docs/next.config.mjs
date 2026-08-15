import { createMDX } from 'fumadocs-mdx/next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const withMDX = createMDX();
const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsBaseUrl = process.env.DOCS_BASE_URL ?? '/';
const basePath = docsBaseUrl === '/' ? undefined : docsBaseUrl.replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const config = {
  basePath,
  output: 'standalone',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/features',
        destination: '/docs/features',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
