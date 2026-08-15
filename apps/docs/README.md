# Nitrowind Docs

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result. From the
repository root, use `yarn docs` or `yarn docs:build`.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

Collections are defined with the [Macro API](https://fumadocs.dev/docs/mdx/macro) in `lib/source.ts`.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Deploy to the VPS

The production deployment builds Next.js in standalone mode, uploads a versioned release over SSH,
and recreates the existing `nitrowind-docs` Compose service. The VPS requires Docker with the
Compose plugin and an external `nitrowind-proxy` network.

```bash
NITROPUSH_VPS_HOST=docs.example.com \
NITROPUSH_DOCS_URL=https://nitrowind.dev \
yarn docs:deploy
```

Optional settings:

| Variable                      | Default               | Purpose                               |
| ----------------------------- | --------------------- | ------------------------------------- |
| `NITROPUSH_VPS_USER`          | current SSH user      | SSH user for the VPS                  |
| `NITROPUSH_VPS_PORT`          | `22`                  | SSH port                              |
| `NITROPUSH_VPS_IDENTITY_FILE` | SSH agent/default key | Private key path                      |
| `NITROPUSH_DOCS_PATH`         | `/opt/nitrowind-docs` | Versioned release directory           |
| `NITROPUSH_DOCS_PORT`         | `8080`                | Port exposed to the VPS reverse proxy |
| `NITROPUSH_DOCS_BASE_URL`     | `/`                   | Optional URL prefix                   |

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.dev) - learn about Fumadocs
