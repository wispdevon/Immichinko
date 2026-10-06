import { afterEach, it, expect } from 'vitest';
import http from 'node:http';
import { createGateway } from '../integrations/server/gateway.mjs';
const servers: http.Server[] = [];
const sockets = new Set<import('node:net').Socket>();
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});
async function start(server: http.Server) {
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function setup() {
  const upstream = await start(
    http.createServer((req, res) => {
      if (req.url === '/api/users/me') {
        res.setHeader('Content-Type', 'application/json');
        if (req.headers.cookie === 'session=owner') res.end('{"id":"owner"}');
        else if (req.headers.cookie === 'session=other')
          res.end('{"id":"other"}');
        else {
          res.statusCode = 401;
          res.end('{}');
        }
        return;
      }
      if (req.url === '/photos') {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('ETag', 'old-html');
        res.end(
          '<html><head><title>Immich</title></head><body>Photos</body></html>',
        );
        return;
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(Buffer.from([0, 1, 2, 255]));
    }),
  );
  const app = await start(
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          path: req.url,
          method: req.method,
          host: req.headers['x-forwarded-host'],
        }),
      );
    }),
  );
  const gateway = await start(
    createGateway({
      immichUrl: upstream,
      appUrl: app,
      ownerId: 'owner',
      publicOrigin: 'https://im.example.com',
    }),
  );
  return { gateway };
}
it('injects a same-origin sidebar script into HTML and invalidates the original ETag', async () => {
  const { gateway } = await setup();
  const res = await fetch(gateway + '/photos');
  const html = await res.text();
  expect(html).toContain('data-app-url="https://im.example.com/immichinko/"');
  expect(html).toContain('src="/immichinko/integration/sidebar.js"');
  expect(res.headers.get('etag')).toBeNull();
  expect(res.headers.get('cache-control')).toBe('no-store');
});
it('keeps anonymous users and other Immich accounts out of the personal companion', async () => {
  const { gateway } = await setup();
  for (const cookie of ['', 'session=other']) {
    const response = await fetch(gateway + '/immichinko/api/today', {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
  }
});
it('forwards authenticated owner requests with the mounted path, method and origin intact', async () => {
  const { gateway } = await setup();
  const res = await fetch(gateway + '/immichinko/api/decisions', {
    method: 'POST',
    headers: { cookie: 'session=owner' },
    body: '{}',
  });
  expect(await res.json()).toEqual({
    path: '/immichinko/api/decisions',
    method: 'POST',
    host: 'im.example.com',
  });
});
it('streams non-HTML Immich data without rewriting binary bytes', async () => {
  const { gateway } = await setup();
  const res = await fetch(gateway + '/api/preview');
  expect(Buffer.from(await res.arrayBuffer())).toEqual(
    Buffer.from([0, 1, 2, 255]),
  );
});
it('serves integration code without credentials', async () => {
  const { gateway } = await setup();
  const res = await fetch(gateway + '/immichinko/integration/sidebar.js');
  const script = await res.text();
  expect(res.status).toBe(200);
  expect(script).toContain('Sharing');
  expect(script).not.toContain('IMMICH_API_KEY');
});
it('preserves upgraded Socket.IO/WebSocket byte streams', async () => {
  const upstream = http.createServer();
  upstream.on('upgrade', (_req, socket, head) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    if (head.length) socket.write(head);
    socket.on('data', (data) => socket.write(data));
    socket.on('error', () => socket.destroy());
  });
  const target = await start(upstream);
  const gateway = await start(
    createGateway({
      immichUrl: target,
      appUrl: target,
      ownerId: 'owner',
      publicOrigin: 'https://im.example.com',
    }),
  );
  const { connect } = await import('node:net');
  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(new URL(gateway).port), '127.0.0.1');
    let text = '';
    let sent = false;
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error('Upgrade timed out'));
    });
    socket.on('connect', () =>
      socket.write(
        'GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: im.example.com\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      ),
    );
    socket.on('data', (data) => {
      text += data.toString();
      if (!sent && text.includes('\r\n\r\n')) {
        sent = true;
        expect(text).toContain('101 Switching Protocols');
        socket.write('fixture-ping');
      }
      if (text.includes('fixture-ping')) {
        socket.destroy();
        resolve();
      }
    });
    socket.on('error', reject);
  });
});

it('rejects network-path URLs before forwarding caller credentials', async () => {
  const { gateway } = await setup();
  const res = await fetch(gateway + '//127.0.0.1:9/private', {
    headers: { cookie: 'session=owner' },
  });
  expect(res.status).toBe(400);
});
