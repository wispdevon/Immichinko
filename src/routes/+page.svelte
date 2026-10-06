<script lang="ts">
  import { Button } from '@immich/ui';
  import { onMount } from 'svelte';
  type Session = {
    date: string;
    nextDate: string;
    total: number;
    reviewed: number;
    favorites: number;
    complete: boolean;
    skipped: number;
    undo: { id: string } | null;
    photo: {
      id: string;
      date: string;
      location: string;
      reason: string;
      url: string;
    } | null;
  };
  let session = $state<Session | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let imageLoaded = $state(false);
  let imageError = $state(false);
  let imageVersion = $state(0);
  function retryPreview() {
    imageLoaded = false;
    imageError = false;
    imageVersion++;
  }
  let pending = $state<
    { batch: string; id: string; action: string; requestId: string } | undefined
  >();
  async function load() {
    loading = true;
    error = '';
    try {
      const r = await fetch('/api/today');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (session?.photo?.id !== data.photo?.id) {
        imageLoaded = false;
        imageError = false;
      }
      session = data;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  async function decide(action: string) {
    if (busy || !session || (action !== 'undo' && !imageLoaded)) return;
    const id = action === 'undo' ? session.undo?.id : session.photo?.id;
    if (!id) return;
    busy = true;
    error = '';
    if (!pending || pending.id !== id || pending.action !== action)
      pending = {
        batch: session.date,
        id,
        action,
        requestId:
          crypto.randomUUID?.() ??
          Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
            n.toString(16).padStart(2, '0'),
          ).join(''),
      };
    try {
      const r = await fetch(
        action === 'undo' ? '/api/undo' : '/api/decisions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      pending = undefined;
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  function key(e: KeyboardEvent) {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.repeat ||
      loading ||
      busy ||
      (e.target as HTMLElement)?.closest('input,select,textarea')
    )
      return;
    const actions: Record<string, string> = {
      f: 'favorite',
      p: 'pass',
      l: 'later',
      u: 'undo',
    };
    if (actions[e.key.toLowerCase()]) {
      e.preventDefault();
      void decide(actions[e.key.toLowerCase()]);
    }
  }
  onMount(() => {
    void load();
    const refresh = () => {
      if (!busy) void load();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  });
</script>

<svelte:window onkeydown={key} />
<div class="topline">
  <div>
    <h1>Today</h1>
    <p class="muted">A few moments from your library.</p>
  </div>
  <span class="muted" aria-live="polite"
    >{session
      ? `${session.reviewed} / ${session.total} reviewed`
      : 'Ten photos, at your pace'}</span
  >
</div>
{#if session?.photo}
  <div
    class="progressbar"
    role="progressbar"
    aria-label="Session progress"
    aria-valuenow={session.reviewed}
    aria-valuemin={0}
    aria-valuemax={session.total}
  >
    <span style:width={`${(session.reviewed / session.total) * 100}%`}></span>
  </div>
  <div class="stage" aria-busy={!imageLoaded && !imageError}>
    {#if !imageLoaded}
      <div class="loading" role="status">
        <span
          >{imageError
            ? 'Preview could not load. Use Open in Immich or retry.'
            : 'Loading photograph…'}</span
        >
        {#if imageError}<Button variant="outline" onclick={retryPreview}
            >Retry preview</Button
          >{/if}
      </div>
    {/if}
    {#key `${session.photo.id}-${imageVersion}`}
      <img
        src={`/api/preview/${session.photo.id}`}
        alt={`Photograph captured ${new Date(session.photo.date).toLocaleDateString()}`}
        onload={() => {
          imageLoaded = true;
          imageError = false;
        }}
        onerror={() => (imageError = true)}
        style:opacity={imageLoaded ? 1 : 0}
      />
    {/key}
  </div>
  <div class="meta">
    <div>
      <strong
        >{new Date(session.photo.date).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{session.photo.location
          ? ` · ${session.photo.location}`
          : ''}</strong
      >
      <p class="muted">{session.photo.reason}</p>
    </div>
    <a class="muted" href={session.photo.url} target="_blank" rel="noreferrer"
      >Open in Immich ↗</a
    >
  </div>
  <div class="actions">
    <Button
      size="large"
      disabled={busy || loading || !imageLoaded}
      onclick={() => decide('favorite')}>♡ Favorite</Button
    ><Button
      variant="outline"
      size="large"
      disabled={busy || loading || !imageLoaded}
      onclick={() => decide('pass')}>Pass</Button
    ><Button
      variant="outline"
      size="large"
      disabled={busy || loading || !imageLoaded}
      onclick={() => decide('later')}>Later</Button
    ><Button
      variant="ghost"
      size="large"
      disabled={busy || loading || !session.undo}
      onclick={() => decide('undo')}>↶ Undo</Button
    >
  </div>
  <p class="shortcuts">
    <kbd>F</kbd> Favorite · <kbd>P</kbd> Pass for 90 days · <kbd>L</kbd> Later
    in 7 days · <kbd>U</kbd> Undo
  </p>
{:else if loading}<div class="stage">
    <span class="loading">Finding your photographs…</span>
  </div>
{:else if session}<div class="empty">
    <h2>
      {session.complete
        ? 'A little closer to your favorites.'
        : 'No photographs to review.'}
    </h2>
    <p class="muted">
      {session.reviewed} reviewed · {session.favorites} favorites added
    </p>
    <p class="muted">Next batch: {session.nextDate}</p>
    {#if session.skipped}<p class="muted">
        {session.skipped} unavailable photos skipped.
      </p>{/if}{#if session.undo}<Button
        variant="outline"
        disabled={busy}
        onclick={() => decide('undo')}>Undo last decision</Button
      >{/if}
  </div>
{:else}<div class="empty">
    <h2>Connect your photo library</h2>
    <p class="muted">
      Set your Immich connection on the server to begin rediscovering your
      photos.
    </p>
    <a href="/settings">Connection settings →</a>
  </div>{/if}
{#if error}<p class="error" role="alert">{error}</p>
  <div class="actions">
    <Button variant="outline" disabled={busy} onclick={load}
      >Reload Today</Button
    >{#if pending}<Button
        disabled={busy}
        onclick={() => decide(pending!.action)}>Retry decision</Button
      >{/if}
  </div>{/if}
