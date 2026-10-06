<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { savedTheme } from '$lib/preferences';
  let embedded = $state(false);
  let { children } = $props();
  onMount(() => {
    embedded = window.parent !== window;
    let parentTheme: string | undefined;
    let parentOrigin: string | undefined;
    try {
      parentOrigin = new URL(document.referrer).origin;
    } catch {
      /* standalone */
    }
    const media = matchMedia('(prefers-color-scheme: dark)');
    function apply() {
      const saved = savedTheme();
      document.documentElement.classList.toggle(
        'dark',
        saved === 'dark' ||
          (saved === 'system' &&
            (parentTheme ? parentTheme === 'dark' : media.matches)),
      );
    }
    apply();
    media.addEventListener('change', apply);
    window.addEventListener('immichinko:theme-preference', apply);
    function message(event: MessageEvent) {
      if (
        !embedded ||
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        event.data?.type !== 'immichinko:theme' ||
        !['dark', 'light'].includes(event.data.theme)
      )
        return;
      parentTheme = event.data.theme;
      apply();
    }
    window.addEventListener('message', message);
    if (embedded && parentOrigin)
      window.parent.postMessage({ type: 'immichinko:ready' }, parentOrigin);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('immichinko:theme-preference', apply);
      window.removeEventListener('message', message);
    };
  });
</script>

<svelte:head
  ><title>Immichinko · Daily photo rediscovery</title><meta
    name="description"
    content="Ten photographs. A little time to look again."
  /></svelte:head
>
<div class:embedded>
  <header>
    <a class="brand" href={`${base}/`}
      >Immichinko<span>Daily photo rediscovery</span></a
    >
    <nav aria-label="Main">
      <a
        href={`${base}/`}
        aria-current={page.url.pathname === `${base}/` ||
        page.url.pathname === base
          ? 'page'
          : undefined}>Today</a
      ><a
        href={`${base}/progress`}
        aria-current={page.url.pathname === `${base}/progress`
          ? 'page'
          : undefined}>Progress</a
      ><a
        href={`${base}/settings`}
        aria-current={page.url.pathname === `${base}/settings`
          ? 'page'
          : undefined}>Settings</a
      >
    </nav>
  </header>
  <main>{@render children()}</main>
  <footer>Ten photographs. A little time to look again.</footer>
</div>
