import { SnapshotBytes } from './snapshot-bytes';
import { SnapshotReader } from './snapshot-reader';

export class StringTable {
  private readonly items: string[] = [];
  private readonly indexByValue = new Map<string, number>();

  public intern(value: string): number {
    const existing = this.indexByValue.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.items.length;
    this.items.push(value);
    this.indexByValue.set(value, index);
    return index;
  }

  public get(index: number): string {
    if (index < 0 || index >= this.items.length) {
      throw new Error(`Invalid StringTable index: ${index}`);
    }
    return this.items[index];
  }

  public writeTo(writer: SnapshotBytes): void {
    writer.writeVarUint(this.items.length);
    for (const item of this.items) {
      writer.writeUtf8String(item);
    }
  }

  public static readFrom(reader: SnapshotReader): StringTable {
    const table = new StringTable();
    const count = reader.readVarUint();
    if (count > 100_000) {
      throw new Error(`Unreasonable StringTable count: ${count}`);
    }
    for (let i = 0; i < count; i++) {
      table.intern(reader.readUtf8String());
    }
    return table;
  }
}
