<script lang="ts">
 import '../app.css';
 import { onMount } from 'svelte';
 let { children } = $props();
 onMount(()=>{ const saved=localStorage.getItem('immichinko-theme')||'system'; document.documentElement.classList.toggle('dark',saved==='dark'||(saved==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)); });
</script>
<svelte:head><title>Immichinko · Daily photo rediscovery</title><meta name="description" content="Ten photographs. A little time to look again."/></svelte:head>
<header><a class="brand" href="/">Immichinko<span>Daily photo rediscovery</span></a><nav aria-label="Main"><a href="/">Today</a><a href="/progress">Progress</a><a href="/settings">Settings</a></nav></header>
<main>{@render children()}</main>
<footer>Ten photographs. A little time to look again.</footer>
