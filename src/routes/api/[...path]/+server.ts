import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { service } from '$lib/server/runtime';
import { eligible } from '$lib/server/immich';
export const GET: RequestHandler = async ({ params }) => {
  try {
    const s = service();
    const path = params.path;
    if (path === 'today')
      return json(await s.serial(() => s.today()), {
        headers: { 'Cache-Control': 'no-store' },
      });
    if (path === 'progress')
      return json(
        await s.serial(async () => {
          await s.reconcile();
          return s.progress();
        }),
      );
    if (path === 'status') {
      await s.immich.random(new Date().toISOString(), true);
      return json({ connected: true, timezone: s.tz });
    }
    if (path.startsWith('preview/')) {
      const id = path.slice(8);
      return await s.serial(async () => {
        const known = s.store.state.batches.some((b) =>
          b.picks.some((p) => p.id === id),
        );
        if (!known) return new Response(null, { status: 404 });
        const a = await s.immich.get(id);
        if (!eligible(a)) return new Response(null, { status: 404 });
        const r = await s.immich.request(
          `/assets/${encodeURIComponent(id)}/thumbnail?size=preview`,
        );
        return new Response(r.body, {
          headers: {
            'Content-Type': r.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      });
    }
    return new Response(null, { status: 404 });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: 503 },
    );
  }
};
export const POST: RequestHandler = async ({ params, request, url }) => {
  if (
    request.headers.get('origin') !== url.origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return json(
      { error: 'Same-origin JSON request required.' },
      { status: 403 },
    );
  try {
    const body = await request.text();
    if (body.length > 2048)
      return json({ error: 'Request too large.' }, { status: 413 });
    let b;
    try {
      b = JSON.parse(body);
    } catch {
      return json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    if (!b || typeof b !== 'object' || Array.isArray(b))
      return json({ error: 'Invalid decision.' }, { status: 400 });
    if (
      !['decisions', 'undo'].includes(params.path) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.batch) ||
      typeof b.id !== 'string' ||
      !/^[-a-zA-Z0-9]{1,64}$/.test(b.id) ||
      typeof b.requestId !== 'string' ||
      !/^[-a-zA-Z0-9]{16,64}$/.test(b.requestId) ||
      (params.path === 'decisions' &&
        !['favorite', 'pass', 'later'].includes(b.action))
    )
      return json({ error: 'Invalid decision.' }, { status: 400 });
    const s = service();
    await s.serial(() =>
      s.decide(
        b.batch,
        b.id,
        params.path === 'undo' ? 'undo' : b.action,
        b.requestId,
      ),
    );
    return json({ ok: true });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: 409 },
    );
  }
};
