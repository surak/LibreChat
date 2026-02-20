import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';

interface KeyvMemoryOptions {
  collection?: string;
}

const stores = new Map<string, Map<string, { value: unknown; expiresAt: number | null }>>();

class KeyvMemoryCustom extends EventEmitter {
  public ttlSupport: boolean;
  public namespace?: string;
  private store: Map<string, { value: unknown; expiresAt: number | null }>;

  constructor(options: KeyvMemoryOptions = {}) {
    super();
    const collection = options.collection || 'keyv';
    if (!stores.has(collection)) {
      stores.set(collection, new Map());
    }
    this.store = stores.get(collection)!;
    this.ttlSupport = true;
  }

  private isExpired(entry: { value: unknown; expiresAt: number | null }): boolean {
    if (entry.expiresAt === null) {
      return false;
    }
    return Date.now() > entry.expiresAt;
  }

  async get(key: string): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async getMany(keys: string[]): Promise<unknown[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const expiresAt = typeof ttl === 'number' ? Date.now() + ttl : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    let allDeleted = true;
    for (const key of keys) {
      if (!this.store.delete(key)) {
        allDeleted = false;
      }
    }
    return allDeleted;
  }

  async clear(): Promise<void> {
    if (this.namespace) {
      for (const key of this.store.keys()) {
        if (key.startsWith(`${this.namespace}:`)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.clear();
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async disconnect(): Promise<boolean> {
    return true;
  }
}

const keyvMemory = new KeyvMemoryCustom({
  collection: 'logs',
});

keyvMemory.on('error', (err) => logger.error('KeyvMemory error:', err));

export default keyvMemory;
export { KeyvMemoryCustom as KeyvMemoryCustom };
