import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const port = parseInt(process.env.PORT || '3000', 10);
  console.log(`Starting server on port ${port}...`);

  // Load the Next.js standalone server
  const { default: app } = await import('./server.js');

  if (!app) {
    throw new Error('Failed to load Next.js server');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`✓ Server successfully listening on port ${port}`);
  });

  // Handle errors
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

} catch (err) {
  console.error('Failed to start server:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
}
