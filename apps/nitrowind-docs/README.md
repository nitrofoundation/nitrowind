# Nitrowind Docs Deployment

The documentation site is compiled by Docusaurus and served as static files by Caddy. It does not depend on GitHub Actions or GitHub Pages.

## Run locally

From the repository root:

```sh
yarn docs:docker:up
```

Open [http://localhost:8080](http://localhost:8080). Follow the server output with `yarn docs:docker:logs`, and stop it with `yarn docs:docker:down`.

## Deploy to a NitroPush VPS

`yarn docs:deploy` builds the static site locally, transfers a versioned release over SSH, then starts or recreates the Caddy container on the VPS. The VPS only needs Docker with the Compose plugin and SSH access.

```sh
NITROPUSH_VPS_HOST=docs.example.com \
NITROPUSH_DOCS_URL=https://docs.example.com \
yarn docs:deploy
```

Configure the NitroPush reverse proxy to forward the public hostname to `http://127.0.0.1:8080` and terminate HTTPS at the proxy.

The deployment accepts these optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NITROPUSH_VPS_USER` | current SSH user | SSH user for the VPS |
| `NITROPUSH_VPS_PORT` | `22` | SSH port |
| `NITROPUSH_VPS_IDENTITY_FILE` | SSH agent/default key | Private key path for SSH |
| `NITROPUSH_DOCS_PATH` | `/opt/nitrowind-docs` | Directory that stores releases on the VPS |
| `NITROPUSH_DOCS_PORT` | `8080` | VPS port exposed by the Caddy container |
| `NITROPUSH_DOCS_BASE_URL` | `/` | URL prefix used by Docusaurus |

For example, an SSH key and custom service port:

```sh
NITROPUSH_VPS_HOST=docs.example.com \
NITROPUSH_VPS_USER=deploy \
NITROPUSH_VPS_IDENTITY_FILE=~/.ssh/nitropush \
NITROPUSH_DOCS_URL=https://docs.example.com \
NITROPUSH_DOCS_PORT=8090 \
yarn docs:deploy
```

## Mount below a path

When the docs live below a prefix such as `https://example.com/nitrowind/`, build them with that prefix:

```sh
NITROPUSH_VPS_HOST=docs.example.com \
NITROPUSH_DOCS_URL=https://example.com \
NITROPUSH_DOCS_BASE_URL=/nitrowind/ \
yarn docs:deploy
```

Keep the trailing slash in `DOCS_BASE_URL` so Docusaurus generates correct asset and navigation URLs.
