import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/modules/**/service.ts', 'src/shared/money/**', 'src/shared/dates/**'],
      thresholds: {
        // أهداف التغطية للوحدات الحرجة (الجزء 11.1)
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
