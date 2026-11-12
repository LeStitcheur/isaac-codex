import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'apps/server/src/index.ts' },
  outDir: 'dist/server',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.json',
  // Les dépendances (dont better-sqlite3, module natif) restent dans node_modules.
  skipNodeModulesBundle: true,
  noExternal: ['@isaac-codex/shared'],
  async onSuccess() {
    cpSync('apps/server/drizzle', 'dist/server/drizzle', { recursive: true });
  },
});
