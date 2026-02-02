import('./server.js').then(module => {
  if (module.default && typeof module.default.listen === 'function') {
    const port = parseInt(process.env.PORT || '3000', 10);
    module.default.listen(port, '0.0.0.0', () => {
      console.log(`Server listening on port ${port}`);
    });
  }
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
