import { it, expect, vi, afterEach } from 'vitest';
import { Immich } from '../src/lib/server/immich';
afterEach(() => vi.unstubAllGlobals());
it('uses verified v3.2 filters, bounded size, server credential header and PUT boolean', async () => {
  const call = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', call);
  const immich = new Immich('http://immich.local', 'private-fixture-key');
  await immich.random(
    '2025-10-07T00:00:00.000Z',
    false,
    '2026-10-07T00:00:00.000Z',
  );
  const [url, options] = call.mock.calls[0];
  expect(url).toBe('http://immich.local/api/search/random');
  const body = JSON.parse(options.body);
  expect(body.size).toBe(100);
  expect(body.withDeleted).toBe(false);
  expect(body.withStacked).toBe(false);
  expect(body.filter.trashedAt).toEqual({ eq: null });
  expect(body.filter.takenAt).toEqual({
    gte: '2025-10-07T00:00:00.000Z',
    lte: '2026-10-07T00:00:00.000Z',
  });
  expect(options.headers['x-api-key']).toBe('private-fixture-key');
  await immich.favorite('asset', true);
  expect(call.mock.calls[1][1].method).toBe('PUT');
  expect(JSON.parse(call.mock.calls[1][1].body)).toEqual({ isFavorite: true });
});
it('sanitizes transport errors without revealing URL or key', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('URL private-fixture-key')),
  );
  await expect(
    new Immich('http://immich.local', 'private-fixture-key').get('a'),
  ).rejects.toThrow('unreachable');
});
it('rejects credentials or a non-http URL in configuration', () => {
  expect(() => new Immich('file:///secret', 'key')).toThrow(
    'Invalid Immich URL',
  );
  expect(() => new Immich('https://user:password@immich.local', 'key')).toThrow(
    'Invalid Immich URL',
  );
});
