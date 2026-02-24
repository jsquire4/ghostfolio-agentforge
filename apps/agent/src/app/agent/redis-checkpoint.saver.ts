/**
 * RedisCheckpointSaver
 *
 * Extends BaseCheckpointSaver from @langchain/langgraph-checkpoint to persist
 * LangGraph conversation checkpoints in Redis using raw ioredis commands.
 *
 * Key scheme:
 *   Checkpoints : lg:checkpoint:{thread_id}:{ns}:{checkpoint_id}  (Hash)
 *   Index       : lg:index:{thread_id}:{ns}                       (Sorted Set, score = ms timestamp)
 *   Writes      : lg:writes:{thread_id}:{ns}:{checkpoint_id}:{task_id}:{idx}  (Hash)
 *   Thread index: lg:thread-keys:{thread_id}                      (Set — tracks all key strings)
 *
 * TTL: 604800 seconds (7 days) refreshed on every write.
 */
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
  copyCheckpoint,
  WRITES_IDX_MAP
} from '@langchain/langgraph-checkpoint';
import type {
  CheckpointMetadata,
  PendingWrite
} from '@langchain/langgraph-checkpoint';
import type Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TTL_SECONDS = 604_800; // 7 days

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function checkpointKey(
  threadId: string,
  ns: string,
  checkpointId: string
): string {
  return `lg:checkpoint:${threadId}:${ns}:${checkpointId}`;
}

function indexKey(threadId: string, ns: string): string {
  return `lg:index:${threadId}:${ns}`;
}

function writesKey(
  threadId: string,
  ns: string,
  checkpointId: string,
  taskId: string,
  idx: number
): string {
  return `lg:writes:${threadId}:${ns}:${checkpointId}:${taskId}:${idx}`;
}

function threadKeysKey(threadId: string): string {
  return `lg:thread-keys:${threadId}`;
}

// ---------------------------------------------------------------------------
// RedisCheckpointSaver
// ---------------------------------------------------------------------------

export class RedisCheckpointSaver extends BaseCheckpointSaver {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  // -------------------------------------------------------------------------
  // getTuple — fetch checkpoint by thread_id + optional checkpoint_id
  // -------------------------------------------------------------------------

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const ns: string =
      (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    let checkpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) return undefined;

    // If no specific checkpoint_id, find the latest from the sorted set index.
    if (!checkpointId) {
      const latest = await this.redis.zrevrangebyscore(
        indexKey(threadId, ns),
        '+inf',
        '-inf',
        'LIMIT',
        0,
        1
      );
      if (!latest || latest.length === 0) return undefined;
      checkpointId = latest[0];
    }

    const ckptKey = checkpointKey(threadId, ns, checkpointId);
    const raw = await this.redis.hgetall(ckptKey);

    // hgetall returns {} when the key does not exist.
    if (!raw?.['type'] || !raw['data']) return undefined;

    const checkpoint = (await this.serde.loadsTyped(
      raw['type'],
      raw['data']
    )) as Checkpoint;

    const metadata =
      raw['metadata_type'] && raw['metadata_data']
        ? ((await this.serde.loadsTyped(
            raw['metadata_type'],
            raw['metadata_data']
          )) as CheckpointMetadata)
        : ({ source: 'loop', step: -1, parents: {} } as CheckpointMetadata);

    const parentCheckpointId: string | undefined =
      raw['parent_checkpoint_id'] || undefined;

    // Fetch pending writes for this checkpoint.
    const pendingWrites = await this._loadPendingWrites(
      threadId,
      ns,
      checkpointId
    );

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: checkpointId
        }
      },
      checkpoint,
      metadata,
      pendingWrites
    };

    if (parentCheckpointId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: parentCheckpointId
        }
      };
    }

    return tuple;
  }

  // -------------------------------------------------------------------------
  // list — async generator yielding CheckpointTuples in reverse-chron order
  // -------------------------------------------------------------------------

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const { before, limit, filter } = options ?? {};
    const threadId = config.configurable?.thread_id as string | undefined;
    const ns: string =
      (config.configurable?.checkpoint_ns as string | undefined) ?? '';

    if (!threadId) return;

    // Score upper bound: exclude the "before" checkpoint (it uses uuid6 IDs which sort
    // lexicographically; the sorted set score is the insertion timestamp in ms).
    let maxScore = '+inf';
    if (before?.configurable?.checkpoint_id) {
      // Retrieve the score for the "before" checkpoint to use as exclusive upper bound.
      const score = await this.redis.zscore(
        indexKey(threadId, ns),
        before.configurable.checkpoint_id as string
      );
      if (score !== null) {
        // Exclusive upper bound: use "(score" syntax
        maxScore = `(${score}`;
      }
    }

    const count = limit ?? 1_000;
    const checkpointIds = await this.redis.zrevrangebyscore(
      indexKey(threadId, ns),
      maxScore,
      '-inf',
      'LIMIT',
      0,
      count
    );

    let yielded = 0;
    for (const checkpointId of checkpointIds) {
      if (limit !== undefined && yielded >= limit) break;

      const ckptKey = checkpointKey(threadId, ns, checkpointId);
      const raw = await this.redis.hgetall(ckptKey);
      if (!raw?.['type'] || !raw['data']) continue;

      const checkpoint = (await this.serde.loadsTyped(
        raw['type'],
        raw['data']
      )) as Checkpoint;

      const metadata =
        raw['metadata_type'] && raw['metadata_data']
          ? ((await this.serde.loadsTyped(
              raw['metadata_type'],
              raw['metadata_data']
            )) as CheckpointMetadata)
          : ({ source: 'loop', step: -1, parents: {} } as CheckpointMetadata);

      // Apply metadata filter if provided.
      if (filter) {
        const passes = Object.entries(filter).every(
          ([k, v]) => (metadata as Record<string, unknown>)[k] === v
        );
        if (!passes) continue;
      }

      const parentCheckpointId: string | undefined =
        raw['parent_checkpoint_id'] || undefined;

      const pendingWrites = await this._loadPendingWrites(
        threadId,
        ns,
        checkpointId
      );

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: ns,
            checkpoint_id: checkpointId
          }
        },
        checkpoint,
        metadata,
        pendingWrites
      };

      if (parentCheckpointId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: ns,
            checkpoint_id: parentCheckpointId
          }
        };
      }

      yield tuple;
      yielded++;
    }
  }

  // -------------------------------------------------------------------------
  // put — store a checkpoint and update the sorted set index
  // -------------------------------------------------------------------------

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    // newVersions is part of the abstract signature but not needed for storage
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _newVersions?: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const ns: string =
      (config.configurable?.checkpoint_ns as string | undefined) ?? '';

    if (!threadId) {
      throw new Error(
        'Failed to put checkpoint. The passed RunnableConfig is missing a required ' +
          '"thread_id" field in its "configurable" property.'
      );
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const checkpointId = preparedCheckpoint.id;
    const parentCheckpointId =
      (config.configurable?.checkpoint_id as string | undefined) ?? '';

    const [[ckptType, ckptData], [metaType, metaData]] = await Promise.all([
      this.serde.dumpsTyped(preparedCheckpoint),
      this.serde.dumpsTyped(metadata)
    ]);

    const ckptKey = checkpointKey(threadId, ns, checkpointId);
    const idxKey = indexKey(threadId, ns);
    const tKeysKey = threadKeysKey(threadId);
    const score = Date.now();

    // Pipeline: HSET checkpoint hash, ZADD index, SADD thread key set, EXPIRE on all.
    const pipeline = this.redis.pipeline();

    pipeline.hset(ckptKey, {
      type: ckptType,
      data: Buffer.isBuffer(ckptData) ? ckptData : Buffer.from(ckptData),
      metadata_type: metaType,
      metadata_data: Buffer.isBuffer(metaData)
        ? metaData
        : Buffer.from(metaData),
      parent_checkpoint_id: parentCheckpointId
    });
    pipeline.expire(ckptKey, TTL_SECONDS);

    pipeline.zadd(idxKey, score, checkpointId);
    pipeline.expire(idxKey, TTL_SECONDS);

    pipeline.sadd(tKeysKey, ckptKey, idxKey);
    pipeline.expire(tKeysKey, TTL_SECONDS);

    await pipeline.exec();

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: ns,
        checkpoint_id: checkpointId
      }
    };
  }

  // -------------------------------------------------------------------------
  // putWrites — store pending writes for a checkpoint
  // -------------------------------------------------------------------------

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const ns: string =
      (config.configurable?.checkpoint_ns as string | undefined) ?? '';
    const checkpointId = config.configurable?.checkpoint_id as
      | string
      | undefined;

    if (!threadId) {
      throw new Error(
        'Failed to put writes. The passed RunnableConfig is missing a required ' +
          '"thread_id" field in its "configurable" property.'
      );
    }
    if (!checkpointId) {
      throw new Error(
        'Failed to put writes. The passed RunnableConfig is missing a required ' +
          '"checkpoint_id" field in its "configurable" property.'
      );
    }

    const tKeysKey = threadKeysKey(threadId);
    const pipeline = this.redis.pipeline();

    // Pre-compute serialization and exists checks in parallel
    const prepared = await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const writeIdx =
          channel in WRITES_IDX_MAP
            ? WRITES_IDX_MAP[channel as keyof typeof WRITES_IDX_MAP]
            : idx;

        const wKey = writesKey(threadId, ns, checkpointId, taskId, writeIdx);

        // Do not overwrite a non-negative (regular) write that already exists.
        if (writeIdx >= 0) {
          const exists = await this.redis.exists(wKey);
          if (exists) return null;
        }

        const [wType, wData] = await this.serde.dumpsTyped(value);
        return { wKey, taskId, channel, wType, wData };
      })
    );

    // Build pipeline synchronously — no interleaving
    for (const entry of prepared) {
      if (!entry) continue;
      pipeline.hset(entry.wKey, {
        task_id: entry.taskId,
        channel: entry.channel,
        type: entry.wType,
        data: Buffer.isBuffer(entry.wData)
          ? entry.wData
          : Buffer.from(entry.wData)
      });
      pipeline.expire(entry.wKey, TTL_SECONDS);
      pipeline.sadd(tKeysKey, entry.wKey);
      pipeline.expire(tKeysKey, TTL_SECONDS);
    }

    await pipeline.exec();
  }

  // -------------------------------------------------------------------------
  // deleteThread — remove all Redis keys associated with a thread
  // -------------------------------------------------------------------------

  async deleteThread(threadId: string): Promise<void> {
    const tKeysKey = threadKeysKey(threadId);
    const allKeys = await this.redis.smembers(tKeysKey);

    if (allKeys.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const k of allKeys) {
        pipeline.del(k);
      }
      pipeline.del(tKeysKey);
      await pipeline.exec();
    } else {
      // Nothing tracked — still try to remove the set itself in case it exists
      // but was not populated (defensive cleanup).
      await this.redis.del(tKeysKey);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Load all pending writes stored under the writes key pattern for a given
   * thread / namespace / checkpoint combination.
   *
   * Writes keys follow the pattern:
   *   lg:writes:{thread_id}:{ns}:{checkpoint_id}:{task_id}:{idx}
   *
   * We track all such keys in the thread-keys Set, so we SMEMBERS that set and
   * filter to writes for this checkpoint.
   */
  private async _loadPendingWrites(
    threadId: string,
    ns: string,
    checkpointId: string
  ): Promise<[string, string, unknown][]> {
    const tKeysKey = threadKeysKey(threadId);
    const allKeys = await this.redis.smembers(tKeysKey);

    const writePrefix = `lg:writes:${threadId}:${ns}:${checkpointId}:`;
    const matchingKeys = allKeys.filter((k) => k.startsWith(writePrefix));

    if (matchingKeys.length === 0) return [];

    matchingKeys.sort((a, b) => {
      const idxA = parseInt(a.split(':').pop() ?? '0', 10);
      const idxB = parseInt(b.split(':').pop() ?? '0', 10);
      return idxA - idxB;
    });

    const entries = await Promise.all(
      matchingKeys.map(async (wKey) => {
        const raw = await this.redis.hgetall(wKey);
        if (
          !raw?.['task_id'] ||
          !raw['channel'] ||
          !raw['type'] ||
          !raw['data']
        ) {
          return null;
        }
        const value = await this.serde.loadsTyped(raw['type'], raw['data']);
        return [raw['task_id'], raw['channel'], value] as [
          string,
          string,
          unknown
        ];
      })
    );

    return entries.filter((e): e is [string, string, unknown] => e !== null);
  }
}
