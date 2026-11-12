import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Integratsion testlar bitta lokal bazadagi qoldiqlarni baham ko'radi — fayllar ketma-ket ishlasin
    fileParallelism: false,
    testTimeout: 30000,
  },
});
