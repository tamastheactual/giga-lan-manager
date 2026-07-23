import { defineConfig } from 'vitest/config';
import path from 'path';

// Vitest runs the engine tests (server/**) and any shared/client unit tests.
// The aliases mirror vite.config.ts so `$shared` / `$lib` resolve in tests too.
export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $shared: path.resolve('./shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
