import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import postcss from 'postcss';
import { compileCss } from '@nitrofoundation/nitrowind/compiler';

const fromExample = path => fileURLToPath(new URL(path, import.meta.url));
const globalCssPath = fromExample('./global.css');
const exampleRoot = fromExample('./');

function elevateUtilityRules(css) {
  const root = postcss.parse(css);

  root.walkAtRules('layer', layer => {
    if (layer.params.trim() !== 'utilities' || !layer.nodes) return;

    layer.walkRules(rule => {
      let parent = rule.parent;
      while (parent && parent !== layer) {
        if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) {
          return;
        }
        parent = parent.parent;
      }

      rule.selectors = rule.selectors.map(selector =>
        selector.startsWith('#root ') ? selector : `#root ${selector}`,
      );
    });

    layer.replaceWith(...layer.nodes);
  });

  return root.toString();
}

function nitrowindBrowserCss() {
  return {
    name: 'nitrowind-browser-css',
    enforce: 'pre',
    async transform(_source, id) {
      if (id.split('?')[0] !== globalCssPath) return null;

      const css = await compileCss({
        cwd: exampleRoot,
        input: './global.web.css',
        content: [
          './App.tsx',
          './app/**/*.{js,jsx,ts,tsx}',
          './components/**/*.{js,jsx,ts,tsx}',
        ],
      });

      return elevateUtilityRules(css);
    },
    handleHotUpdate({ file, server }) {
      const normalized = file.replaceAll('\\', '/');
      const examplePath = exampleRoot.replaceAll('\\', '/');
      const changesCandidates =
        normalized === globalCssPath.replaceAll('\\', '/') ||
        normalized === `${examplePath}global.web.css` ||
        normalized === `${examplePath}App.tsx` ||
        normalized.startsWith(`${examplePath}app/`) ||
        normalized.startsWith(`${examplePath}components/`);

      if (!changesCandidates) return;

      const cssModule = server.moduleGraph.getModuleById(globalCssPath);
      if (cssModule) server.moduleGraph.invalidateModule(cssModule);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    nitrowindBrowserCss(),
    react({
      babel: {
        plugins: [
          'babel-plugin-react-native-web',
          'react-native-worklets/plugin',
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: 'react-native-web',
      },
      {
        find: /^@nitrofoundation\/nitrowind\/svg$/,
        replacement: fromExample('../../packages/nitrowind/src/svg/index.ts'),
      },
      {
        find: /^@nitrofoundation\/nitrowind$/,
        replacement: fromExample('../../packages/nitrowind/src/index.ts'),
      },
      {
        find: /^@nitrofoundation\/nitrocss\/svg$/,
        replacement: fromExample('../../packages/nitrocss/src/svg/index.tsx'),
      },
      {
        find: /^@nitrofoundation\/nitrocss$/,
        replacement: fromExample('../../packages/nitrocss/src/index.ts'),
      },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  server: {
    host: true,
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
  },
}));
