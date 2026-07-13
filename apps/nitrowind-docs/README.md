# Nitrowind Docs Deployment

The documentation site is compiled by Docusaurus and served as static files by Caddy. It does not depend on GitHub Actions or GitHub Pages.

## Run locally

From the repository root:

```sh
yarn docs:docker:up
```

Open [http://localhost:8080](http://localhost:8080). Follow the server output with `yarn docs:docker:logs`, and stop it with `yarn docs:docker:down`.

## Deploy to a VPS

Copy the repository to the VPS, install Docker with the Compose plugin, then start the service with the public address it will use:

```sh
DOCS_URL=https://docs.example.com yarn docs:docker:up
```

The container listens on port `8080`. Configure NitroPush, or any other reverse proxy, to forward the public hostname to `http://127.0.0.1:8080` and handle HTTPS at the proxy.

For a non-default host port, set `DOCS_PORT`:

```sh
DOCS_URL=https://docs.example.com DOCS_PORT=8090 yarn docs:docker:up
```

## Mount below a path

When the docs live below a prefix such as `https://example.com/nitrowind/`, build them with that prefix:

```sh
DOCS_URL=https://example.com DOCS_BASE_URL=/nitrowind/ yarn docs:docker:up
```

Keep the trailing slash in `DOCS_BASE_URL` so Docusaurus generates correct asset and navigation URLs.
