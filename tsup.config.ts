import { defineConfig } from 'tsup';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'esbuild';

/**
 * Resolves Vite-style `*.worker.ts?worker&url` imports to a runtime
 * `new URL('./workers/<name>.worker.js', import.meta.url)` expression that
 * points at the sibling worker bundle in `dist/`.
 *
 * The worker entries are declared separately in `entry` below so esbuild emits
 * each as a standalone chunk.
 */
const workerUrlPlugin: Plugin = {
  name: 'worker-url',
  setup(build) {
    build.onResolve({ filter: /\.worker\.ts\?worker&url$/ }, (args) => ({
      path: args.path,
      namespace: 'worker-url',
    }));
    build.onLoad({ filter: /.*/, namespace: 'worker-url' }, (args) => {
      const match = /([^/]+)\.worker\.ts\?worker&url$/.exec(args.path);
      const name = match ? match[1] : 'worker';
      return {
        contents: `export default new URL('./workers/${name}.worker.js', import.meta.url);`,
        loader: 'ts',
      };
    });
  },
};

/**
 * Resolves Vite-style `*.glsl?raw` (and any other `?raw`) imports as text.
 * Honors the `@/` tsconfig alias so existing source paths keep working.
 */
const rawImportPlugin: Plugin = {
  name: 'raw-import',
  setup(build) {
    const aliasRoot = resolve(__dirname, 'src');
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const cleaned = args.path.replace(/\?raw$/, '');
      const absolute = cleaned.startsWith('@/')
        ? resolve(aliasRoot, cleaned.slice(2))
        : resolve(args.resolveDir, cleaned);
      return { path: absolute, namespace: 'raw-import' };
    });
    build.onLoad({ filter: /.*/, namespace: 'raw-import' }, async (args) => {
      const text = await readFile(args.path, 'utf8');
      return { contents: text, loader: 'text' };
    });
  },
};

export default defineConfig({
  entry: {
    PimcoRenderer: 'src/index.ts',
    'workers/asset-manager.worker': 'src/workers/asset-manager.worker.ts',
    'workers/render-slave.worker': 'src/workers/render-slave.worker.ts',
    'workers/text-render-slave.worker': 'src/workers/text-render-slave.worker.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  dts: { entry: { PimcoRenderer: 'src/index.ts' } },
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
  // Inline these runtime deps. The worker chunks are served to consumers as
  // static .js files via `new URL('./workers/...', import.meta.url)`, so their
  // imports are NOT processed by the consumer's bundler — any bare specifier
  // left in a worker file becomes an unresolvable-module error at construction
  // time (with an empty ErrorEvent, no message). Bundling them in is the only
  // way to make the published workers self-contained.
  noExternal: ['gl-matrix', 'webgl-postprocessor'],
  esbuildPlugins: [workerUrlPlugin, rawImportPlugin],
});
