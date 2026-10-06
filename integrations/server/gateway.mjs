// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const prefix = '/immichinko';
const scriptPath = prefix + '/integration/sidebar.js';
const scriptFile = fileURLToPath(
  new URL('../../static/integrations/immichinko.user.js', import.meta.url),
);
const hop = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
/** @param {import('node:http').IncomingHttpHeaders} headers */
function safeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => !hop.has(k.toLowerCase())),
  );
}
/** @param {string} text */
function escapeAttribute(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
/** @param {{immichUrl:string,appUrl:string,publicOrigin:string,ownerId:string}} config */
export function createGateway({ immichUrl, appUrl, publicOrigin, ownerId }) {
  const upstream = new URL(immichUrl);
  const companion = new URL(appUrl);
  const origin = new URL(publicOrigin);
  if (
    !ownerId ||
    origin.username ||
    origin.password ||
    ![upstream, companion, origin].every((u) =>
      ['http:', 'https:'].includes(u.protocol),
    )
  )
    throw new Error(
      'Valid upstream URLs, public origin and owner ID are required.',
    );
  const injection = `<script defer src="${scriptPath}" data-app-url="${escapeAttribute(origin.origin + prefix + '/')}"></script>`;
  /** @param {import('node:http').IncomingMessage} req */
  async function authorized(req) {
    /** @type {Record<string,string>} */
    const headers = {};
    for (const name of ['cookie', 'authorization', 'x-api-key'])
      if (req.headers[name]) headers[name] = String(req.headers[name]);
    if (!Object.keys(headers).length) return false;
    const response = await fetch(new URL('/api/users/me', upstream), {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const user = await response.json();
    return user.id === ownerId;
  }
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} target
   */
  function proxy(req, res, target, inject = false) {
    const headers = safeHeaders(req.headers);
    headers.host = origin.host;
    headers['x-forwarded-host'] = origin.host;
    headers['x-forwarded-proto'] = origin.protocol.slice(0, -1);
    if (inject) {
      headers['accept-encoding'] = 'identity';
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
    }
    const transport = target.protocol === 'https:' ? https : http;
    const outgoing = transport.request(
      new URL(req.url || '/', target),
      { method: req.method, headers },
      (response) => {
        response.on('error', () => {
          if (!res.headersSent) res.writeHead(502);
          res.end('Immich response interrupted.');
        });
        const result = safeHeaders(response.headers);
        const html =
          inject &&
          req.method === 'GET' &&
          response.statusCode === 200 &&
          String(result['content-type']).includes('text/html');
        if (!html) {
          res.writeHead(response.statusCode || 502, result);
          response.pipe(res);
          return;
        }
        // Immich honors Accept-Encoding: identity; fail safely if that changes.
        if (
          result['content-encoding'] &&
          result['content-encoding'] !== 'identity'
        ) {
          res.writeHead(response.statusCode || 502, result);
          response.pipe(res);
          return;
        }
        /** @type {Buffer[]} */
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) {
            response.destroy();
            if (!res.headersSent) res.writeHead(502);
            res.end('Immich page exceeds integration limit.');
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (res.writableEnded) return;
          const text = Buffer.concat(chunks).toString('utf8');
          const body = text.replace(/<\/head\s*>/i, injection + '</head>');
          delete result['content-length'];
          delete result.etag;
          delete result['last-modified'];
          result['cache-control'] = 'no-store';
          res.writeHead(response.statusCode || 502, result);
          res.end(body);
        });
      },
    );
    outgoing.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end('Service temporarily unavailable.');
    });
    outgoing.setTimeout(120000, () => outgoing.destroy());
    req.on('aborted', () => outgoing.destroy());
    req.pipe(outgoing);
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (
        !req.url?.startsWith('/') ||
        req.url.startsWith('//') ||
        req.url.includes('\\')
      ) {
        res.writeHead(400);
        res.end('Invalid request path.');
        return;
      }
      const path = new URL(req.url || '/', 'http://gateway.local').pathname;
      if (
        path === scriptPath &&
        ['GET', 'HEAD'].includes(req.method || 'GET')
      ) {
        const script = await readFile(scriptFile);
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : script);
        return;
      }
      if (path === prefix || path.startsWith(prefix + '/')) {
        if (!(await authorized(req))) {
          res.writeHead(401, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(
            'Sign in to Immich with the configured library owner account, then reopen Immichinko.',
          );
          return;
        }
        proxy(req, res, companion);
        return;
      }
      proxy(req, res, upstream, true);
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end('Service temporarily unavailable.');
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (
      !req.url?.startsWith('/') ||
      req.url.startsWith('//') ||
      req.url.includes('\\')
    ) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    // Immich's Socket.IO connection must continue through the same origin.
    const path = new URL(req.url || '/', 'http://gateway.local').pathname;
    if (path === prefix || path.startsWith(prefix + '/')) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const transport = upstream.protocol === 'https:' ? https : http;
    const request = transport.request(new URL(req.url || '/', upstream), {
      headers: {
        ...req.headers,
        host: origin.host,
        'x-forwarded-host': origin.host,
        'x-forwarded-proto': origin.protocol.slice(0, -1),
      },
    });
    request.on('upgrade', (response, upSocket, upHead) => {
      socket.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`,
      );
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        socket.write(
          `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`,
        );
      socket.write('\r\n');
      if (upHead.length) socket.write(upHead);
      if (head.length) upSocket.write(head);
      upSocket.on('error', () => socket.destroy());
      socket.on('error', () => upSocket.destroy());
      socket.on('close', () => upSocket.destroy());
      upSocket.pipe(socket);
      socket.pipe(upSocket);
    });
    request.on('response', (response) => {
      socket.end(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\n\r\n`,
      );
      response.resume();
    });
    request.on('error', () => socket.destroy());
    request.end();
  });
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createGateway({
    immichUrl: process.env.IMMICH_UPSTREAM_URL || '',
    appUrl: process.env.IMMICHINKO_UPSTREAM_URL || 'http://immichinko:3000',
    publicOrigin: process.env.ORIGIN || '',
    ownerId: process.env.IMMICH_OWNER_ID || '',
  });
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () =>
    console.log('Immichinko integration gateway ready.'),
  );
}
