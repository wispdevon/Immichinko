import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Pick } from './selection';
export type Decision = {
  id: string;
  action: 'favorite' | 'pass' | 'later';
  at: string;
  previous: boolean;
  updatedAt?: string;
  undone?: boolean;
  priorCooldown?: Cooldown;
};
export type Cooldown = { until: string; action: string };
export type Batch = {
  date: string;
  picks: Pick[];
  decisions: Decision[];
  skipped: string[];
  completed?: string;
};
export type Journal = {
  requestId: string;
  batch: string;
  asset: string;
  action: Decision['action'];
  undo?: boolean;
  target: boolean;
  previous: boolean;
  beforeUpdatedAt?: string;
  priorCooldown?: Cooldown;
  at: string;
};
export type State = {
  batches: Batch[];
  cooldowns: Record<string, Cooldown>;
  journal?: Journal;
  requests: Record<string, string>;
};
export class Store {
  db: DatabaseSync;
  state: State;
  private committed: string;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)',
    );
    const row = this.db.prepare('SELECT value FROM state WHERE id=1').get() as
      { value: string } | undefined;
    this.state = row
      ? JSON.parse(row.value)
      : { batches: [], cooldowns: {}, requests: {} };
    this.committed = JSON.stringify(this.state);
  }
  save() {
    const value = JSON.stringify(this.state);
    try {
      this.db
        .prepare(
          'INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
        )
        .run(value);
      this.committed = value;
    } catch {
      this.state = JSON.parse(this.committed);
      throw new Error(
        'Local history could not be saved. Check the database volume and retry.',
      );
    }
  }
}
