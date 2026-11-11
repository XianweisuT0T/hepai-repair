import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArrangementState, Finish, Identity, Mark, Melody, Milestone, NoteSymbol, PaperNote, PlacementReply, PublicWork, Stage, Stamp, Timbre, Work } from '../shared/types.js';

export interface Member {
  id: Identity; tokenHash: string; ready: boolean; swapReady: boolean; launchReady: boolean;
  shareConsent: boolean; exhibitConsent?: boolean; word: string; left: boolean; testConsent: boolean;
  commands: Record<string, { fingerprint: string; ok: boolean; error?: string }>;
  feedback?: { comfortable: string; again: string; comment: string; at: string };
}
export interface Room {
  code: string; mode: 'real' | 'demo'; stage: Stage; version: number;
  members: Member[]; installed: Record<string, string>; notes: (NoteSymbol | null)[];
  melody: Melody | null; timbre: Timbre; timbreConfirmed: boolean; finish: Finish;
  marks: Mark[]; hintCount: number; hint?: string; work?: Work;
  createdAt: number; expiresAt: number; performanceAt?: number; demoOwnerHash?: string;
  events: { self: Identity; type: string; stage: Stage; at: number; detail?: string }[];
  gearOrder?: string[]; placementReply?: PlacementReply; winding?: number;
  windingAt?: number; windingDurationMs?: number; windingPausedAt?: number;
  stamps?: Record<Identity, Stamp>; milestones?: Milestone[];
  arrangement?: ArrangementState;
  lastArrangementAuditionAt?: number;
  paperNotes?:PaperNote[];
}
export interface StoredWork { work: PublicWork; expiresAt: number; roomCode: string }
export interface Database { schema: 1; rooms: Record<string, Room>; works: Record<string, StoredWork> }

export class JsonStore {
  readonly file: string;
  data: Database = { schema: 1, rooms: {}, works: {} };
  private pending: Promise<void> = Promise.resolve();
  constructor(readonly directory: string) { this.file = path.join(directory, 'state.json'); }
  async load() {
    await mkdir(this.directory, { recursive: true });
    try {
      const content = JSON.parse(await readFile(this.file, 'utf8')) as Database;
      if (content.schema !== 1 || !content.rooms || !content.works) throw new Error('快照格式无效');
      this.data = content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  save() {
    const serialized = JSON.stringify(this.data, null, 2);
    // Ordered, atomic replacement: a later mutation cannot be overwritten by an older write.
    const operation = this.pending.then(async () => {
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.file);
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
  flush() { return this.pending; }
}
