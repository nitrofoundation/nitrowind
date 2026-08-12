# Nitrowind documentation

The Astro and Starlight documentation app for [nitrowind.dev](https://nitrowind.dev).

## Local development

From the repository root:

```bash
yarn docs
```

The development server runs on `http://localhost:4321` by default.

## Static build

```bash
yarn docs:build
```

The production site is written to `apps/docs/dist` and includes the Pagefind search index and XML sitemap.
