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
  if (req.url === '/api/users/me') {
    if (req.headers.cookie === 'immich_access_token=fixture-session') {
      res.end(JSON.stringify({ id: 'fixture-owner' }));
    } else {
      res.statusCode = 401;
      res.end('{}');
    }
    return;
  }
  if (
    ['/photos', '/sharing', '/explore', '/login'].includes(
      req.url?.split('?')[0],
    )
  ) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const loggedIn =
      req.headers.cookie === 'immich_access_token=fixture-session';
    res.end(`<!doctype html><html class="dark"><head><title>Immich fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#000;color:#ddd}header{height:80px;padding:20px 28px;border-bottom:1px solid #333;display:flex;gap:16px;align-items:center}header strong{font-size:30px;color:#accbfa}.shell{display:grid;grid-template-columns:256px auto;height:calc(100dvh - 80px);overflow:hidden}#sidebar{position:relative;overflow:auto;z-index:20;background:#000;padding:28px 20px 20px 0}#sidebar a{display:flex;align-items:center;padding:14px 20px;text-decoration:none;color:inherit;gap:16px;border-radius:0 24px 24px 0;min-height:48px}#sidebar a>div{display:flex;align-items:center;gap:16px}#sidebar svg{width:24px;height:24px;fill:currentColor}#sidebar a[aria-current=page]{background:#253044;color:#accbfa}main{position:relative;min-width:0}.original{padding:36px}#top-menu-button{display:none}button{font:inherit;color:inherit;border:0}#immichinko-panel{background:#171717}
    @media(max-width:700px){.shell{grid-template-columns:0px auto}#sidebar{width:256px;box-shadow:8px 0 20px #0008;position:relative;transition:transform .1s}#sidebar[inert]{transform:translateX(-100%)}#top-menu-button{display:block;background:transparent}}
    </style></head><body><header><button id="top-menu-button" aria-label="Main menu">☰</button><strong>immich</strong></header>${loggedIn ? `<div class="shell"><nav id="sidebar"><div>${['Photos', 'Explore', 'Map', 'People', 'Sharing', 'Favorites'].map((name) => `<div><div class="relative flex items-center"><a href="/${name.toLowerCase()}" class="nav-row" ${name === 'Photos' ? 'aria-current="page"' : ''}><div><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg><span>${name}</span></div></a></div></div>`).join('')}</div></nav><main><div class="original" id="original-content"><h1>Photos</h1><p>Your Immich timeline stays here.</p></div></main></div>` : '<main><h1>Sign in to Immich</h1></main>'}<script>
    document.getElementById('top-menu-button').addEventListener('click',()=>{const s=document.getElementById('sidebar');if(s)s.inert=!s.inert;});
    if(innerWidth<700){const s=document.getElementById('sidebar');if(s)s.inert=true;}
    document.addEventListener('click',e=>{const a=e.target.closest('#sidebar a');if(!a||a.closest('#immichinko-sidebar-row'))return;e.preventDefault();history.pushState({},'',a.getAttribute('href'));document.querySelector('h1').textContent=a.textContent;});
    </script></body></html>`);
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
