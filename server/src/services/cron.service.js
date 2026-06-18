import cron from 'node-cron';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';

/**
 * Scheduled job: Auto-expire blood requests that have passed their expiresAt date.
 *
 * WHY THIS IS NEEDED:
 * Without this, a request whose `expiresAt` has passed continues to have its
 * `status` field set to 'ACTIVE' in the database.  This means:
 *   - The requester's own "My Requests" page shows it as still active.
 *   - The admin's "All Requests" view shows it as active (unless the query
 *     includes the expiresAt filter that the public feed uses).
 *   - Any report or analytics counting "active requests" over-counts.
 *
 * The public donor feed (`getRequests`) already filters by `expiresAt: { $gt: new Date() }`,
 * so expired requests don't appear there — but the status field in the DB is wrong.
 *
 * This job runs every 30 minutes and batch-updates all stale records.
 * It also cancels any INTERESTED/RESERVED donor interests on newly-expired requests
 * so those donors don't receive misleading "you have a pending interest" indicators.
 *
 * Schedule: Every 30 minutes  ('30 * * * *')
 */
export function startCronJobs() {
  cron.schedule('*/30 * * * *', async () => {
    const now = new Date();

    try {
      // 1. Find all ACTIVE requests that have passed their expiry time
      const expiredRequests = await BloodRequest.find({
        status: { $in: ['ACTIVE', 'PARTIALLY_FULFILLED'] },
        expiresAt: { $lt: now },
      }).select('_id');

      if (expiredRequests.length === 0) return;

      const expiredIds = expiredRequests.map((r) => r._id);

      // 2. Update their status to EXPIRED
      await BloodRequest.updateMany(
        { _id: { $in: expiredIds } },
        { $set: { status: 'EXPIRED' } }
      );

      // 3. Withdraw any open donor interests on these expired requests
      //    so donors' interest history does not show lingering INTERESTED/RESERVED entries
      const withdrawResult = await DonorInterest.updateMany(
        {
          requestId: { $in: expiredIds },
          status: { $in: ['INTERESTED', 'RESERVED', 'REVEAL_PENDING'] },
        },
        { $set: { status: 'WITHDRAWN' } }
      );

      console.log(
        `[CRON] Auto-expired ${expiredIds.length} request(s). ` +
        `Withdrew ${withdrawResult.modifiedCount} open donor interest(s).`
      );
    } catch (error) {
      console.error('[CRON] Auto-expire job failed:', error);
    }
  });

  console.log('[CRON] Scheduled jobs registered: request auto-expiry (every 30 min)');
}
