import adapter from '@sveltejs/adapter-node';
export default {
  kit: {
    paths: { base: process.env.IMMICHINKO_BASE_PATH || '' },
    adapter: adapter({ out: process.env.IMMICHINKO_BUILD_DIR || 'build' }),
  },
};
