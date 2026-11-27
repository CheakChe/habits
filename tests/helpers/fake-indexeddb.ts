type KeyPath = string | string[];

interface StoreSchema {
  keyPath: KeyPath;
  autoIncrement: boolean;
  nextId: number;
  records: Map<string, unknown>;
  indexes: Set<string>;
}

function encodeKey(key: unknown): string {
  return JSON.stringify(key);
}

function extractKey(record: Record<string, unknown>, keyPath: KeyPath): unknown {
  if (Array.isArray(keyPath)) {
    return keyPath.map((k) => record[k]);
  }
  return record[keyPath];
}

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

function createRequest<T>(executor: () => T): IDBRequest<T> {
  const req: Record<string, unknown> = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    try {
      req.result = executor();
      if (typeof req.onsuccess === 'function') {
        (req.onsuccess as (ev: Event) => void)(new Event('success'));
      }
    } catch (err) {
      req.error = err instanceof Error ? err : new Error(String(err));
      if (typeof req.onerror === 'function') {
        (req.onerror as (ev: Event) => void)(new Event('error'));
      }
    }
  });
  return req as unknown as IDBRequest<T>;
}

interface DatabaseEntry {
  version: number;
  stores: Map<string, StoreSchema>;
}

export interface SeedStoreSpec {
  keyPath: KeyPath;
  autoIncrement?: boolean;
  nextId?: number;
  indexes?: string[];
  records?: Array<Record<string, unknown>>;
}

export class FakeIndexedDBFactory {
  private readonly databases = new Map<string, DatabaseEntry>();

  public reset(): void {
    this.databases.clear();
  }

  public seedDatabase(
    name: string,
    version: number,
    storesSpec: Record<string, SeedStoreSpec>
  ): void {
    const stores = new Map<string, StoreSchema>();
    for (const [storeName, spec] of Object.entries(storesSpec)) {
      const records = new Map<string, unknown>();
      let maxNumericKey = 0;
      for (const raw of spec.records ?? []) {
        const rec = cloneRecord(raw);
        const key = extractKey(rec, spec.keyPath);
        records.set(encodeKey(key), rec);
        if (typeof key === 'number' && key > maxNumericKey) {
          maxNumericKey = key;
        }
      }
      stores.set(storeName, {
        keyPath: spec.keyPath,
        autoIncrement: Boolean(spec.autoIncrement),
        nextId: spec.nextId ?? maxNumericKey + 1,
        records,
        indexes: new Set(spec.indexes ?? []),
      });
    }
    this.databases.set(name, { version, stores });
  }

  public open(name: string, version?: number): IDBOpenDBRequest {
    let entry = this.databases.get(name);
    const oldVersion = entry ? entry.version : 0;
    const targetVersion = version ?? (entry ? entry.version : 1);
    const needsUpgrade = !entry || targetVersion > oldVersion;
    if (!entry) {
      entry = {
        version: targetVersion,
        stores: new Map<string, StoreSchema>(),
      };
      this.databases.set(name, entry);
    } else if (needsUpgrade) {
      entry.version = targetVersion;
    }

    const storeMap = entry.stores;

    const db: Record<string, unknown> = {
      name,
      version: targetVersion,
      objectStoreNames: {
        contains(storeName: string): boolean {
          return storeMap.has(storeName);
        },
      },
      createObjectStore(
        storeName: string,
        options?: { keyPath?: KeyPath; autoIncrement?: boolean }
      ) {
        const schema: StoreSchema = {
          keyPath: options?.keyPath ?? 'id',
          autoIncrement: Boolean(options?.autoIncrement),
          nextId: 1,
          records: new Map(),
          indexes: new Set(),
        };
        storeMap.set(storeName, schema);
        return {
          createIndex(indexName: string) {
            schema.indexes.add(indexName);
          },
        };
      },
      transaction(storeNames: string | string[], _mode?: IDBTransactionMode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        for (const s of names) {
          if (!storeMap.has(s)) {
            throw new Error(`Object store "${s}" does not exist`);
          }
        }

        let pendingOps = 0;
        let completed = false;
        let finishScheduled = false;

        const scheduleFinish = () => {
          if (finishScheduled || completed) return;
          finishScheduled = true;
          setTimeout(() => {
            finishScheduled = false;
            if (pendingOps === 0 && !completed) {
              completed = true;
              if (typeof tx.oncomplete === 'function') {
                (tx.oncomplete as (ev: Event) => void)(new Event('complete'));
              }
            }
          }, 0);
        };

        const tx: Record<string, unknown> = {
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore(storeName: string) {
            const schema = storeMap.get(storeName);
            if (!schema) {
              throw new Error(`Object store "${storeName}" not found`);
            }

            const track = <T>(fn: () => T): IDBRequest<T> => {
              pendingOps += 1;
              return createRequest(() => {
                try {
                  return fn();
                } finally {
                  pendingOps -= 1;
                  if (pendingOps === 0) {
                    scheduleFinish();
                  }
                }
              });
            };

            return {
              get(key: unknown) {
                return track(() => {
                  const found = schema.records.get(encodeKey(key));
                  return found !== undefined ? cloneRecord(found) : undefined;
                });
              },
              getAll() {
                return track(() => Array.from(schema.records.values()).map((r) => cloneRecord(r)));
              },
              add(value: Record<string, unknown>) {
                return track(() => {
                  const rec = cloneRecord(value);
                  let key = extractKey(rec, schema.keyPath);
                  if (
                    key === undefined &&
                    schema.autoIncrement &&
                    typeof schema.keyPath === 'string'
                  ) {
                    key = schema.nextId++;
                    rec[schema.keyPath] = key;
                  } else if (
                    typeof key === 'number' &&
                    schema.autoIncrement &&
                    key >= schema.nextId
                  ) {
                    schema.nextId = key + 1;
                  }
                  const encoded = encodeKey(key);
                  if (schema.records.has(encoded)) {
                    throw new Error(`Duplicate key in "${storeName}": ${encoded}`);
                  }
                  schema.records.set(encoded, rec);
                  return key as IDBValidKey;
                });
              },
              put(value: Record<string, unknown>) {
                return track(() => {
                  const rec = cloneRecord(value);
                  let key = extractKey(rec, schema.keyPath);
                  if (
                    key === undefined &&
                    schema.autoIncrement &&
                    typeof schema.keyPath === 'string'
                  ) {
                    key = schema.nextId++;
                    rec[schema.keyPath] = key;
                  } else if (
                    typeof key === 'number' &&
                    schema.autoIncrement &&
                    key >= schema.nextId
                  ) {
                    schema.nextId = key + 1;
                  }
                  schema.records.set(encodeKey(key), rec);
                  return key as IDBValidKey;
                });
              },
              clear() {
                return track(() => {
                  schema.records.clear();
                });
              },
            };
          },
        };

        // Ensure read-only or no-op transactions also settle if caller awaits promisifyTx
        scheduleFinish();

        return tx as unknown as IDBTransaction;
      },
    };

    const openReq: Record<string, unknown> = {
      result: db,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    };

    queueMicrotask(() => {
      if (needsUpgrade && typeof openReq.onupgradeneeded === 'function') {
        (openReq.onupgradeneeded as (ev: IDBVersionChangeEvent) => void)(
          {} as IDBVersionChangeEvent
        );
      }
      if (typeof openReq.onsuccess === 'function') {
        (openReq.onsuccess as (ev: Event) => void)(new Event('success'));
      }
    });

    return openReq as unknown as IDBOpenDBRequest;
  }
}
