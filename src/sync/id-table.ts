import { SnapshotBytes } from './snapshot-bytes';
import { SnapshotReader } from './snapshot-reader';

export class IdTable {
  private readonly ids: number[] = [];
  private readonly indexById = new Map<number, number>();

  public intern(id: number): number {
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Domain id must be a positive integer, got: ${id}`);
    }
    const existing = this.indexById.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.ids.length;
    this.ids.push(id);
    this.indexById.set(id, index);
    return index;
  }

  public get(index: number): number {
    if (index < 0 || index >= this.ids.length) {
      throw new Error(`Invalid IdTable index: ${index}`);
    }
    return this.ids[index];
  }

  public writeTo(writer: SnapshotBytes): void {
    writer.writeVarUint(this.ids.length);
    for (const id of this.ids) {
      writer.writeVarUint(id);
    }
  }

  public static readFrom(reader: SnapshotReader): IdTable {
    const table = new IdTable();
    const count = reader.readVarUint();
    if (count > 100_000) {
      throw new Error(`Unreasonable IdTable count: ${count}`);
    }
    for (let i = 0; i < count; i++) {
      table.intern(reader.readVarUint());
    }
    return table;
  }
}
