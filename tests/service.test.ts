import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  Immich,
  UpstreamError,
  eligible,
  type Asset,
} from '../src/lib/server/immich';
import { Store } from '../src/lib/server/store';
import { Service } from '../src/lib/server/service';
import { select, day, yearBoundary, shift } from '../src/lib/server/selection';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
function asset(id: string, date = '2020-01-01'): Asset {
  return {
    id,
    type: 'IMAGE',
    isFavorite: false,
    visibility: 'timeline',
    fileCreatedAt: date + 'T12:00:00Z',
    updatedAt: '2026-10-07T00:00:00Z',
  };
}
class Fake extends Immich {
  assets = new Map<string, Asset>();
  writes = 0;
  calls = 0;
  fail = 0;
  timeout = false;
  unreachable = false;
  constructor(list: Asset[]) {
    super('http://immich.local', 'fixture-secret');
    list.forEach((a) => this.assets.set(a.id, { ...a }));
  }
  override async get(id: string) {
    if (this.unreachable) throw new Error('Timed out');
    const a = this.assets.get(id);
    if (!a) throw new UpstreamError(404);
    return { ...a };
  }
  override async random(boundary: string, older: boolean) {
    this.calls++;
    return [...this.assets.values()].filter((a) =>
      older ? a.fileCreatedAt < boundary : a.fileCreatedAt >= boundary,
    );
  }
  override async favorite(id: string, value: boolean) {
    this.writes++;
    if (this.fail) throw new UpstreamError(this.fail);
    const a = this.assets.get(id)!;
    a.isFavorite = value;
    a.updatedAt = `2026-10-07T00:00:${String(this.writes).padStart(2, '0')}Z`;
    if (this.timeout) {
      this.timeout = false;
      throw new Error('Timed out');
    }
    return { ...a };
  }
}
const stores: Store[] = [];
const paths: string[] = [];
afterEach(() => {
  stores.forEach((s) => s.db.close());
  stores.length = 0;
  paths.forEach((p) => rmSync(p, { recursive: true, force: true }));
  paths.length = 0;
});
function setup(list = [asset('a'), asset('b')], path = ':memory:') {
  const store = new Store(path);
  stores.push(store);
  const fake = new Fake(list);
  let clock = new Date('2026-10-07T12:00:00Z');
  const service = new Service(store, fake, 'Asia/Bangkok', () => clock);
  return {
    store,
    fake,
    service,
    setClock: (d: string) => {
      clock = new Date(d);
    },
  };
}
const request = (n: number) => `request-000000000${n}`;
describe('selection', () => {
  it('fills 6 older, 3 recent and 1 deferred, deduplicating and preferring days', () => {
    const old = Array.from({ length: 12 }, (_, i) =>
      asset('o' + i, `2020-01-${String(i + 1).padStart(2, '0')}`),
    );
    const recent = Array.from({ length: 8 }, (_, i) =>
      asset('r' + i, `2026-01-${String(i + 1).padStart(2, '0')}`),
    );
    const p = select([...old, ...old], recent, [asset('d')], new Set(), 'UTC');
    expect(p).toHaveLength(10);
    expect(p.filter((p) => p.reason.includes('more than'))).toHaveLength(6);
    expect(p.filter((p) => p.reason === 'From the past year')).toHaveLength(3);
    expect(new Set(p.map((p) => p.id)).size).toBe(10);
  });
  it('handles cooldowns, missing quotas, duplicates and empty libraries', () => {
    expect(
      select(
        [asset('a'), asset('a'), asset('b')],
        [],
        [],
        new Set(['b']),
        'UTC',
      ),
    ).toEqual([{ id: 'a', reason: 'A moment from more than a year ago' }]);
    expect(select([], [], [], new Set(), 'UTC')).toEqual([]);
  });
  it('prefers different capture days before repeated days', () => {
    const out = select(
      [asset('a'), asset('b'), asset('c', '2020-01-02')],
      [],
      [],
      new Set(),
      'UTC',
    );
    expect(out.map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });
  it('excludes locked, archived, unavailable, favorites, video and secondary stacks', () => {
    for (const fields of [
      { visibility: 'locked' },
      { isArchived: true },
      { isOffline: true },
      { isTrashed: true },
      { isFavorite: true },
      { type: 'VIDEO' },
      { stack: { primaryAssetId: 'other' } },
    ])
      expect(eligible({ ...asset('a'), ...fields })).toBe(false);
  });
  it('uses local day, calendar cooldown and leap year boundary', () => {
    expect(day(new Date('2026-10-06T18:00Z'), 'Asia/Bangkok')).toBe(
      '2026-10-07',
    );
    expect(shift('2024-02-28', 7)).toBe('2024-03-06');
    expect(yearBoundary(new Date('2024-02-29T12:00Z'))).toBe(
      '2023-02-28T12:00:00.000Z',
    );
  });
});
describe('persistent review', () => {
  it('bounds requests and resumes across midnight and restart', async () => {
    const path = mkdtempSync(join(tmpdir(), 'immichinko-'));
    paths.push(path);
    const a = setup(undefined, join(path, 'state.sqlite'));
    const first = await a.service.today();
    expect(a.fake.calls).toBe(6);
    await a.service.decide(first.date, 'a', 'later', request(1));
    a.setClock('2026-10-08T12:00Z');
    expect((await a.service.today()).photo?.id).toBe('b');
    const reopened = new Store(join(path, 'state.sqlite'));
    stores.push(reopened);
    expect(reopened.state.batches[0].decisions).toHaveLength(1);
    expect(a.store.state.cooldowns.a.until).toBe('2026-10-14');
  });
  it('favorites immediately, deduplicates retries and restores favorite on undo', async () => {
    const { service, fake, store } = setup();
    const t = await service.today();
    await service.decide(t.date, 'a', 'favorite', request(1));
    await service.decide(t.date, 'a', 'favorite', request(1));
    expect(fake.writes).toBe(1);
    expect(service.progress().favorites).toBe(1);
    await service.decide(t.date, 'a', 'undo', request(2));
    expect(fake.assets.get('a')?.isFavorite).toBe(false);
    expect(service.progress().reviewed).toBe(0);
    expect(store.state.cooldowns.a).toBeUndefined();
    expect((await service.today()).photo?.id).toBe('a');
  });
  it('denied favorite leaves photo and no count; permits a subsequent pass', async () => {
    const { service, fake, store } = setup();
    const t = await service.today();
    fake.fail = 403;
    await expect(
      service.decide(t.date, 'a', 'favorite', request(1)),
    ).rejects.toThrow('denied');
    expect(store.state.journal).toBeUndefined();
    expect((await service.today()).photo?.id).toBe('a');
    expect(service.progress().reviewed).toBe(0);
    await service.decide(t.date, 'a', 'pass', request(2));
    expect(store.state.cooldowns.a.until).toBe('2027-01-05');
  });
  it('reconciles applied timeout after reopening without duplicate write', async () => {
    const path = mkdtempSync(join(tmpdir(), 'immichinko-'));
    paths.push(path);
    const { service, fake } = setup(undefined, join(path, 'state.sqlite'));
    const t = await service.today();
    fake.timeout = true;
    await expect(
      service.decide(t.date, 'a', 'favorite', request(1)),
    ).rejects.toThrow();
    const reopened = new Store(join(path, 'state.sqlite'));
    stores.push(reopened);
    const restarted = new Service(
      reopened,
      fake,
      'Asia/Bangkok',
      () => new Date('2026-10-07T12:00Z'),
    );
    await restarted.today();
    expect(fake.writes).toBe(1);
    expect(restarted.progress().favorites).toBe(1);
    expect(reopened.state.journal).toBeUndefined();
  });
  it('retries an interrupted write that had not reached Immich', async () => {
    const { service, fake, store } = setup();
    const t = await service.today();
    store.state.journal = {
      batch: t.date,
      asset: 'a',
      action: 'favorite',
      previous: false,
      target: true,
      beforeUpdatedAt: fake.assets.get('a')!.updatedAt,
      requestId: request(1),
      at: '2026-10-07T12:00Z',
    };
    store.save();
    await service.today();
    expect(fake.writes).toBe(1);
    expect(service.progress().reviewed).toBe(1);
  });
  it('protects externally changed favorite on undo', async () => {
    const { service, fake } = setup();
    const t = await service.today();
    await service.decide(t.date, 'a', 'favorite', request(1));
    fake.assets.get('a')!.updatedAt = 'external';
    await expect(
      service.decide(t.date, 'a', 'undo', request(2)),
    ).rejects.toThrow('changed');
    expect(fake.writes).toBe(1);
  });
  it('skips deleted or externally favorited photos without review credit', async () => {
    const { service, fake } = setup([asset('a'), asset('b'), asset('c')]);
    await service.today();
    fake.assets.delete('a');
    fake.assets.get('b')!.isFavorite = true;
    const t = await service.today();
    expect(t.skipped).toBe(2);
    expect(t.photo?.id).toBe('c');
    expect(t.reviewed).toBe(0);
  });
  it('serializes concurrent tabs; credits a successful decision once', async () => {
    const { service } = setup();
    const t = await service.today();
    const results = await Promise.allSettled([
      service.serial(() => service.decide(t.date, 'a', 'pass', request(1))),
      service.serial(() => service.decide(t.date, 'a', 'later', request(2))),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(service.progress().reviewed).toBe(1);
  });
  it('small completed batches count; Undo removes completion; empty batches do not', async () => {
    const { service } = setup([asset('a')]);
    const t = await service.today();
    await service.decide(t.date, 'a', 'pass', request(1));
    expect(service.progress().streak).toBe(1);
    expect((await service.today()).complete).toBe(true);
    await service.decide(t.date, 'a', 'undo', request(2));
    expect(service.progress().streak).toBe(0);
    const empty = setup([]);
    expect((await empty.service.today()).complete).toBe(false);
    expect(empty.service.progress().streak).toBe(0);
  });
  it('earns completion on actual local day of resumed batch without a second batch', async () => {
    const { service, setClock, fake } = setup([asset('a')]);
    const t = await service.today();
    setClock('2026-10-08T12:00Z');
    await service.decide(t.date, 'a', 'pass', request(1));
    expect(service.progress().streak).toBe(1);
    expect((await service.today()).date).toBe(t.date);
    expect(fake.calls).toBe(6);
  });
  it('respects cooldown expiry and consecutive-day streak boundaries', async () => {
    const { service, setClock, store } = setup([asset('a')]);
    let t = await service.today();
    await service.decide(t.date, 'a', 'later', request(1));
    setClock('2026-10-08T12:00Z');
    expect((await service.today()).total).toBe(0);
    expect(service.progress().streak).toBe(1);
    setClock('2026-10-14T12:00Z');
    t = await service.today();
    expect(t.photo?.id).toBe('a');
    expect(service.progress().streak).toBe(0);
    store.state.batches[0].completed = '2026-10-13';
    await service.decide(t.date, 'a', 'pass', request(2));
    expect(service.progress().streak).toBe(2);
  });
});
describe('recovery conflicts', () => {
  it('cancels an interrupted unsent save when an external change occurred', async () => {
    const { service, fake, store } = setup();
    const t = await service.today();
    store.state.journal = {
      batch: t.date,
      asset: 'a',
      action: 'favorite',
      previous: false,
      target: true,
      beforeUpdatedAt: 'previous-version',
      requestId: request(1),
      at: '2026-10-07T12:00Z',
    };
    await expect(service.reconcile()).rejects.toThrow('canceled');
    expect(store.state.journal).toBeUndefined();
    expect(fake.writes).toBe(0);
    expect(service.progress().reviewed).toBe(0);
    expect((await service.today()).photo?.id).toBe('a');
  });
  it('rejects reuse of a request ID for a different action', async () => {
    const { service } = setup();
    const t = await service.today();
    await service.decide(t.date, 'a', 'pass', request(1));
    await expect(
      service.decide(t.date, 'b', 'later', request(1)),
    ).rejects.toThrow('already used');
  });
  it('keeps an unresolved journal through a network outage', async () => {
    const { service, fake, store } = setup();
    const t = await service.today();
    store.state.journal = {
      batch: t.date,
      asset: 'a',
      action: 'favorite',
      previous: false,
      target: true,
      requestId: request(1),
      at: '2026-10-07T12:00Z',
    };
    fake.unreachable = true;
    await expect(service.today()).rejects.toThrow('Timed out');
    expect(store.state.journal).toBeDefined();
    fake.unreachable = false;
    await service.today();
    expect(service.progress().reviewed).toBe(1);
  });
});

describe('storage failures', () => {
  it('does not count a local decision that failed to persist', async () => {
    const { service, store } = setup();
    const t = await service.today();
    const write = vi.spyOn(store.db, 'prepare').mockImplementationOnce(() => {
      throw new Error('Disk full');
    });
    await expect(
      service.decide(t.date, 'a', 'pass', request(1)),
    ).rejects.toThrow('could not be saved');
    write.mockRestore();
    expect(service.progress().reviewed).toBe(0);
    expect(store.state.cooldowns.a).toBeUndefined();
    expect((await service.today()).photo?.id).toBe('a');
  });
  it('keeps the durable journal if local finalization fails after remote save', async () => {
    const { service, store, fake } = setup();
    const t = await service.today();
    const original = store.db.prepare.bind(store.db);
    let writes = 0;
    const spy = vi
      .spyOn(store.db, 'prepare')
      .mockImplementation((sql: string) => {
        if (sql.startsWith('INSERT') && ++writes === 2)
          throw new Error('Disk full');
        return original(sql);
      });
    await expect(
      service.decide(t.date, 'a', 'favorite', request(1)),
    ).rejects.toThrow('could not be saved');
    spy.mockRestore();
    expect(store.state.journal).toBeDefined();
    expect(service.progress().reviewed).toBe(0);
    await service.today();
    expect(fake.writes).toBe(1);
    expect(service.progress().reviewed).toBe(1);
  });
});
