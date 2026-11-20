export class SnapshotBytes {
  private buffer: Uint8Array;
  private length: number;
  private textEncoder: TextEncoder;

  constructor(initialCapacity: number = 256) {
    this.buffer = new Uint8Array(initialCapacity);
    this.length = 0;
    this.textEncoder = new TextEncoder();
  }

  private ensureCapacity(extraBytes: number): void {
    const required = this.length + extraBytes;
    if (required <= this.buffer.length) return;
    let nextCapacity = this.buffer.length * 2;
    while (nextCapacity < required) {
      nextCapacity *= 2;
    }
    const next = new Uint8Array(nextCapacity);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  public writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer[this.length++] = value & 0xff;
  }

  public writeUint32BE(value: number): void {
    this.ensureCapacity(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.length, 4);
    view.setUint32(0, value >>> 0, false);
    this.length += 4;
  }

  public writeFloat64(value: number): void {
    this.ensureCapacity(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.length, 8);
    view.setFloat64(0, value, false);
    this.length += 8;
  }

  public writeVarUint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new Error(`Invalid varUint value: ${value}`);
    }
    let v = value;
    while (v >= 128) {
      this.writeUint8((v % 128) | 0x80);
      v = Math.floor(v / 128);
    }
    this.writeUint8(v);
  }

  public writeVarInt(value: number): void {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error(`Invalid varInt value: ${value}`);
    }
    const encoded = value >= 0 ? value * 2 : -value * 2 - 1;
    this.writeVarUint(encoded);
  }

  public writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.byteLength);
    this.buffer.set(bytes, this.length);
    this.length += bytes.byteLength;
  }

  public writeUtf8String(text: string): void {
    const encoded = this.textEncoder.encode(text);
    this.writeVarUint(encoded.byteLength);
    this.writeBytes(encoded);
  }

  public toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  public static computeChecksum(bytes: Uint8Array): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.byteLength; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
