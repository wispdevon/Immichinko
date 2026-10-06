<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  let { children } = $props();
  onMount(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    function apply() {
      const saved = localStorage.getItem('immichinko-theme') || 'system';
      document.documentElement.classList.toggle(
        'dark',
        saved === 'dark' || (saved === 'system' && media.matches),
      );
    }
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });
</script>

<svelte:head
  ><title>Immichinko · Daily photo rediscovery</title><meta
    name="description"
    content="Ten photographs. A little time to look again."
  /></svelte:head
>
<header>
  <a class="brand" href="/">Immichinko<span>Daily photo rediscovery</span></a>
  <nav aria-label="Main">
    <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}
      >Today</a
    ><a
      href="/progress"
      aria-current={page.url.pathname === '/progress' ? 'page' : undefined}
      >Progress</a
    ><a
      href="/settings"
      aria-current={page.url.pathname === '/settings' ? 'page' : undefined}
      >Settings</a
    >
  </nav>
</header>
<main>{@render children()}</main>
<footer>Ten photographs. A little time to look again.</footer>
