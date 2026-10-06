import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { service } from '$lib/server/runtime';
export async function init() {
  if (building || !env.IMMICH_URL || !env.IMMICH_API_KEY) return;
  try {
    const app = service();
    await app.serial(() => app.reconcile());
  } catch {
    // Keep credentials and upstream response bodies out of logs.
    console.warn(
      'Immichinko: startup recovery could not complete; retry Today.',
    );
  }
}
