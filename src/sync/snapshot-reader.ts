export class SnapshotReader {
  private readonly bytes: Uint8Array;
  private offset: number;
  private readonly textDecoder: TextDecoder;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.offset = 0;
    this.textDecoder = new TextDecoder('utf-8', { fatal: true });
  }

  public get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  private ensureAvailable(count: number): void {
    if (count < 0 || this.offset + count > this.bytes.byteLength) {
      throw new Error('Unexpected end of snapshot bytes');
    }
  }

  public readUint8(): number {
    this.ensureAvailable(1);
    return this.bytes[this.offset++];
  }

  public readUint32BE(): number {
    this.ensureAvailable(4);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
    const value = view.getUint32(0, false);
    this.offset += 4;
    return value;
  }

  public readFloat64(): number {
    this.ensureAvailable(8);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
    const value = view.getFloat64(0, false);
    this.offset += 8;
    return value;
  }

  public readVarUint(): number {
    let result = 0;
    let multiplier = 1;
    let bytesRead = 0;
    while (true) {
      if (bytesRead > 9) {
        throw new Error('VarUint overflow in snapshot');
      }
      const byte = this.readUint8();
      const low = byte & 0x7f;
      result += low * multiplier;
      if (!Number.isSafeInteger(result)) {
        throw new Error('VarUint exceeds safe integer range');
      }
      if ((byte & 0x80) === 0) {
        return result;
      }
      multiplier *= 128;
      bytesRead += 1;
    }
  }

  public readVarInt(): number {
    const encoded = this.readVarUint();
    if (encoded % 2 === 0) {
      return encoded / 2;
    }
    return -((encoded + 1) / 2);
  }

  public readBytes(length: number): Uint8Array {
    this.ensureAvailable(length);
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  public readUtf8String(): string {
    const byteLength = this.readVarUint();
    const raw = this.readBytes(byteLength);
    return this.textDecoder.decode(raw);
  }
}
