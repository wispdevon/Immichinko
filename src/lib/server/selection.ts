import { eligible, type Asset } from './immich';
export type Pick = { id: string; reason: string };
export function day(now: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shift(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function yearBoundary(now: Date) {
  const d = new Date(now);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString();
}
export function select(
  old: Asset[],
  recent: Asset[],
  deferred: Asset[],
  blocked: Set<string>,
  tz: string,
): Pick[] {
  const out: Pick[] = [];
  const ids = new Set<string>();
  const days = new Set<string>();
  function take(pool: Asset[], count: number, reason: string) {
    const candidates = [
      ...new Map(
        pool
          .filter((a) => eligible(a) && !blocked.has(a.id))
          .map((a) => [a.id, a]),
      ).values(),
    ];
    const chosen: Asset[] = [];
    for (const distinct of [true, false])
      for (const a of candidates) {
        if (chosen.length >= count) break;
        if (ids.has(a.id)) continue;
        const date = day(new Date(a.fileCreatedAt), tz);
        if (distinct && days.has(date)) continue;
        ids.add(a.id);
        days.add(date);
        chosen.push(a);
        out.push({ id: a.id, reason });
      }
  }
  take(deferred, 1, 'You set this aside earlier');
  take(old, 6, 'A moment from more than a year ago');
  take(recent, 3, 'From the past year');
  take(
    [...old, ...recent, ...deferred],
    10 - out.length,
    'Another moment worth a look',
  );
  return [
    ...out.filter((p) => p.reason !== 'You set this aside earlier'),
    ...out.filter((p) => p.reason === 'You set this aside earlier'),
  ];
}
