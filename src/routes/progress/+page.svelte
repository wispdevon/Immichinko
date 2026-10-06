<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { Button } from '@immich/ui';
  type Progress = {
    reviewed: number;
    favorites: number;
    streak: number;
    days: {
      date: string;
      reviewed: number;
      favorites: number;
      completed: boolean;
    }[];
  };
  let progress = $state<Progress>();
  let error = $state('');
  async function load() {
    error = '';
    try {
      const r = await fetch(`${base}/api/progress`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      progress = d;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  onMount(() => {
    void load();
  });
</script>

<h1>Progress</h1>
<p class="muted">The past seven days, one photograph at a time.</p>
{#if progress}<div class="metrics">
    <div class="metric">
      <strong>{progress.reviewed}</strong><span>Photos reviewed</span>
    </div>
    <div class="metric">
      <strong>{progress.favorites}</strong><span>Favorites added</span>
    </div>
    <div class="metric">
      <strong>{progress.streak}</strong><span>Day completion streak</span>
    </div>
  </div>
  <table>
    <caption class="sr-only">Daily reviews over the last seven days</caption
    ><thead
      ><tr
        ><th scope="col">Day</th><th scope="col">Reviewed</th><th scope="col"
          >Favorites</th
        ><th scope="col">Batch</th></tr
      ></thead
    ><tbody
      >{#each progress.days as d}<tr
          ><th scope="row"
            >{new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}</th
          ><td>{d.reviewed}</td><td>{d.favorites}</td><td
            >{d.completed ? 'Complete' : '—'}</td
          ></tr
        >{/each}</tbody
    >
  </table>
  <p class="muted">
    A completed batch earns one streak day. Small batches count, empty batches
    do not. Undone decisions are removed from your totals.
  </p>
{:else if !error}<p class="muted" role="status">Loading progress…</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>
  <Button variant="outline" onclick={load}>Retry</Button>{/if}
