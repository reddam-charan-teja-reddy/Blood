import Redis from 'ioredis';
import { config } from '../config/env.js';

let redisClient = null;
let isRedisConnected = false;
const fallbackStore = new Map(); // in-memory fallback: Map<key, { value, expiresAt }>

try {
  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        return null; // Stop retrying if Redis server is down
      }
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('⚡ Redis connected successfully');
  });

  redisClient.on('error', () => {
    isRedisConnected = false;
  });

  redisClient.connect().then(() => {
    isRedisConnected = true;
  }).catch(() => {
    isRedisConnected = false;
  });
} catch {
  isRedisConnected = false;
}

export const redis = {
  isReady: () => isRedisConnected,

  async get(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch {
        // Fall back to memory store
      }
    }
    const item = fallbackStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      fallbackStore.delete(key);
      return null;
    }
    return item.value;
  },

  async set(key, value, ttlSeconds = null) {
    if (isRedisConnected && redisClient) {
      try {
        if (ttlSeconds) {
          return await redisClient.set(key, value, 'EX', ttlSeconds);
        }
        return await redisClient.set(key, value);
      } catch {
        // Fall back to memory store
      }
    }
    fallbackStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return 'OK';
  },

  async del(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.del(key);
      } catch {
        // Fall back to memory store
      }
    }
    fallbackStore.delete(key);
    return 1;
  },

  async delByPattern(pattern) {
    if (isRedisConnected && redisClient) {
      try {
        const keys = await redisClient.keys(pattern);
        if (keys && keys.length > 0) {
          await redisClient.del(...keys);
        }
        return keys ? keys.length : 0;
      } catch {
        // Fall back to memory store
      }
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let count = 0;
    for (const key of fallbackStore.keys()) {
      if (regex.test(key)) {
        fallbackStore.delete(key);
        count++;
      }
    }
    return count;
  },

  async acquireLock(lockKey, ttlSeconds = 10) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    if (isRedisConnected && redisClient) {
      try {
        const result = await redisClient.set(lockKey, token, 'NX', 'EX', ttlSeconds);
        return result === 'OK' ? token : null;
      } catch {
        // Fall back to memory store
      }
    }
    const existing = fallbackStore.get(lockKey);
    if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
      return null;
    }
    fallbackStore.set(lockKey, {
      value: token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return token;
  },

  async releaseLock(lockKey, token) {
    if (isRedisConnected && redisClient) {
      try {
        const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
        return await redisClient.eval(script, 1, lockKey, token);
      } catch {
        // Fall back to memory store
      }
    }
    const item = fallbackStore.get(lockKey);
    if (item && item.value === token) {
      fallbackStore.delete(lockKey);
      return 1;
    }
    return 0;
  },

  async close() {
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {}
    }
  }
};
