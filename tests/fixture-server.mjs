// Deterministic API fixture, never loaded by the production app.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const ids = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const now = new Date();
const list = ids.map((id, i) => ({
  id,
  type: 'IMAGE',
  isFavorite: false,
  visibility: 'timeline',
  fileCreatedAt: new Date(
    Date.UTC(i < 6 ? 2020 : now.getUTCFullYear(), i, 5, 12),
  ).toISOString(),
  updatedAt: '2026-10-01T12:00:00Z',
  exifInfo: { city: i % 2 ? 'Chiang Mai' : 'Bangkok', country: 'Thailand' },
}));
let assets = new Map(list.map((a) => [a.id, { ...a }]));
let denied = false;
let writes = 0;
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#afc9cb"/><path d="M0 620L220 180 450 560 730 140 1200 610V800H0Z" fill="#637d78"/><path d="M0 660Q600 580 1200 650V800H0Z" fill="#3e616d"/><text x="40" y="760" fill="white" font-family="sans-serif" font-size="24">Immichinko • deterministic preview fixture</text></svg>`,
);
const preview = process.env.FIXTURE_PHOTO
  ? readFileSync(process.env.FIXTURE_PHOTO)
  : svg;
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let body = '';
  for await (const chunk of req) body += chunk;
  const parsed = body ? JSON.parse(body) : {};
  if (req.url === '/fixture/reset') {
    assets = new Map(list.map((a) => [a.id, { ...a }]));
    writes = 0;
    denied = false;
    res.end('{}');
    return;
  }
  if (req.url === '/fixture/deny') {
    denied = parsed.denied;
    res.end('{}');
    return;
  }
  if (req.url === '/fixture/stats') {
    res.end(JSON.stringify({ writes, assets: [...assets.values()] }));
    return;
  }
  if (req.headers['x-api-key'] !== 'fixture-secret') {
    res.statusCode = 403;
    res.end('{}');
    return;
  }
  if (req.url === '/api/search/random') {
    const filter = parsed.filter;
    if (
      parsed.size !== 100 ||
      parsed.withDeleted !== undefined ||
      !filter ||
      filter.visibility.eq !== 'timeline' ||
      filter.trashedAt.eq !== null ||
      parsed.withStacked !== false
    ) {
      res.statusCode = 400;
      res.end('{}');
      return;
    }
    const boundary = filter.takenAt.lt ?? filter.takenAt.gte;
    res.end(
      JSON.stringify(
        [...assets.values()].filter(
          (a) =>
            !a.isFavorite &&
            (filter.takenAt.lt
              ? a.fileCreatedAt < boundary
              : a.fileCreatedAt >= boundary),
        ),
      ),
    );
    return;
  }
  const match = req.url.match(
    /^\/api\/assets\/([^/?]+)(\/thumbnail\?size=preview)?$/,
  );
  if (match) {
    const a = assets.get(match[1]);
    if (!a) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    if (match[2]) {
      res.setHeader(
        'Content-Type',
        process.env.FIXTURE_PHOTO ? 'image/jpeg' : 'image/svg+xml',
      );
      res.end(preview);
      return;
    }
    if (req.method === 'PUT') {
      if (denied) {
        res.statusCode = 403;
        res.end('{}');
        return;
      }
      writes++;
      a.isFavorite = parsed.isFavorite;
      a.updatedAt = new Date(Date.now() + writes).toISOString();
    }
    res.end(JSON.stringify(a));
    return;
  }
  res.statusCode = 404;
  res.end('{}');
}).listen(4311, '127.0.0.1', () =>
  console.log('Immich fixture listening on 4311'),
);
