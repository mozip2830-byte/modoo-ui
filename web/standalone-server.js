import { createServer } from 'http';
import { nextServer } from './.next/standalone/web/server.js';

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

const server = createServer(nextServer);

server.listen(port, hostname, () => {
  console.log(`Server is running on http://${hostname}:${port}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
