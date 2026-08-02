import mongoose from 'mongoose';
import { config } from './env.js';
import { BloodRequest } from '../models/BloodRequest.js';

async function migrateFlags() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const requests = await BloodRequest.find({
      flaggedBy: { $exists: true, $not: { $size: 0 } }
    });
    let count = 0;
    for (const req of requests) {
      let modified = false;
      const newFlags = [];
      for (const item of req.flaggedBy) {
        if (item && !item.userId) {
          newFlags.push({
            userId: item,
            reason: 'Legacy report reason (No details provided)',
            flaggedAt: req.updatedAt || new Date()
          });
          modified = true;
        } else {
          newFlags.push(item);
        }
      }
      if (modified) {
        req.flaggedBy = newFlags;
        await req.save({ validateBeforeSave: false });
        count++;
      }
    }
    if (count > 0) {
      console.log(`🛠️ Database Migration: Converted legacy flags for ${count} request(s).`);
    }
  } catch (err) {
    console.error('❌ Legacy flags migration failed:', err);
  }
}

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI);
    console.log(`📡 MongoDB Connected: ${conn.connection.host}`);
    await migrateFlags();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Enterprise database transaction wrapper.
 * Automatically executes within a MongoDB replica-set transaction when available,
 * or safely falls back to standard sequential execution in standalone environments.
 */
export const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  const topologyType = mongoose.connection.client?.topology?.description?.type || '';
  const isReplicaSet = topologyType.includes('ReplicaSet');

  if (!isReplicaSet) {
    try {
      return await callback(null);
    } finally {
      await session.endSession();
    }
  }

  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

