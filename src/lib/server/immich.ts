export type Asset = {
  id: string;
  type: string;
  isFavorite: boolean;
  isTrashed?: boolean;
  isOffline?: boolean;
  isArchived?: boolean;
  visibility: string;
  stack?: { primaryAssetId: string };
  fileCreatedAt: string;
  updatedAt: string;
  originalFileName?: string;
  exifInfo?: { city?: string; country?: string };
};
export class UpstreamError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? 'Immich denied access. Check API key permissions.'
        : status === 404
          ? 'This photo is no longer available.'
          : 'Immich could not complete the request. Retry when connected.',
    );
  }
}
export class Immich {
  constructor(
    public url: string,
    private key: string,
  ) {
    if (
      url &&
      (!['http:', 'https:'].includes(new URL(url).protocol) ||
        new URL(url).username ||
        new URL(url).password ||
        new URL(url).search ||
        new URL(url).hash)
    )
      throw new Error('Invalid Immich URL');
  }
  async request(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<Response> {
    if (!this.url || !this.key)
      throw new Error('Configure IMMICH_URL and IMMICH_API_KEY on the server.');
    try {
      const r = await fetch(`${this.url.replace(/\/$/, '')}/api${path}`, {
        method,
        headers: { 'x-api-key': this.key, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      if (!r.ok) throw new UpstreamError(r.status);
      return r;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      throw new Error(
        'Immich is unreachable or the request timed out. Retry to reconcile the save.',
      );
    }
  }
  async get(id: string): Promise<Asset> {
    return (await this.request(`/assets/${encodeURIComponent(id)}`)).json();
  }
  async favorite(id: string, value: boolean): Promise<Asset> {
    return (
      await this.request(`/assets/${encodeURIComponent(id)}`, 'PUT', {
        isFavorite: value,
      })
    ).json();
  }
  async random(
    boundary: string,
    older: boolean,
    until = new Date().toISOString(),
  ): Promise<Asset[]> {
    return (
      await this.request('/search/random', 'POST', {
        size: 100,
        withStacked: false,
        withExif: true,
        filter: {
          type: { eq: 'IMAGE' },
          isFavorite: { eq: false },
          isOffline: { eq: false },
          visibility: { eq: 'timeline' },
          trashedAt: { eq: null },
          takenAt: older ? { lt: boundary } : { gte: boundary, lte: until },
        },
      })
    ).json();
  }
}
export const eligible = (a: Asset) =>
  a.type === 'IMAGE' &&
  !a.isFavorite &&
  !a.isTrashed &&
  !a.isOffline &&
  !a.isArchived &&
  a.visibility === 'timeline' &&
  (!a.stack || a.stack.primaryAssetId === a.id);
