import Dexie, { type Table } from "dexie";

export interface Track {
  id?: number;
  name: string;
  blob: Blob;
  size: number;
}

class MusicDatabase extends Dexie {
  tracks!: Table<Track, number>;

  constructor() {
    super("learnloop-music");
    this.version(1).stores({ tracks: "++id, name" });
  }
}

export const musicDb = new MusicDatabase();
