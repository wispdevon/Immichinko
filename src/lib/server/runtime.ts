import { env } from '$env/dynamic/private';
import { Store } from './store';
import { Immich } from './immich';
import { Service } from './service';
let instance: Service;
export function service() { return instance??=new Service(new Store(env.DATABASE_PATH || 'data/immichinko.sqlite'),new Immich(env.IMMICH_URL || '',env.IMMICH_API_KEY || ''),env.TZ || 'Asia/Bangkok'); }
