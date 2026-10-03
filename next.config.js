module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/r/:id', destination: '/api/r/:id' }];
  },
};
