export default {
  root: new URL('.', import.meta.url).pathname,
  server: { fs: { strict: false } },
  test: { include: ['*.test.ts'], environment: 'node', globals: true },
};
