import cron from 'node-cron';
import { BloodRequest } from '../models/BloodRequest.js';
import { DonorInterest } from '../models/DonorInterest.js';
import { Notification } from '../models/Notification.js';
import { emitToUser } from './socket.service.js';

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

  // Stale reservation cleanup (reservations older than 1 hour without confirmation)
  cron.schedule('*/10 * * * *', async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const staleReservations = await DonorInterest.find({
        status: 'RESERVED',
        reservedAt: { $lt: oneHourAgo },
      });

      if (staleReservations.length > 0) {
        const staleIds = staleReservations.map((r) => r._id);
        await DonorInterest.updateMany(
          { _id: { $in: staleIds } },
          { $set: { status: 'WITHDRAWN' } }
        );
        console.log(`[CRON] Withdrew ${staleReservations.length} stale reservation(s) older than 1 hour.`);

        // Auto-promote waitlisted donors for affected requests
        const affectedRequestIds = [...new Set(staleReservations.map((r) => r.requestId.toString()))];
        for (const reqId of affectedRequestIds) {
          const waitlisted = await DonorInterest.findOne({
            requestId: reqId,
            status: 'WAITLISTED',
          }).sort({ createdAt: 1 });

          if (waitlisted) {
            waitlisted.status = 'INTERESTED';
            await waitlisted.save();
            console.log(`[CRON] Auto-promoted waitlisted donor ${waitlisted.donorId} for request ${reqId}`);

            try {
              const notif = await Notification.create({
                userId: waitlisted.donorId,
                type: 'NEW_REQUEST_MATCH',
                title: '⚡ Donation Slot Opened!',
                message: 'A previous donor reservation expired. You have been promoted from the waitlist.',
                relatedRequestId: reqId,
                link: `/request/${reqId}`,
              });
              emitToUser(waitlisted.donorId.toString(), 'new_notification', notif);
            } catch (err) {
              console.error('[CRON] Failed to notify waitlisted donor:', err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('[CRON] Stale reservation cleanup failed:', error);
    }
  });

  console.log('[CRON] Scheduled jobs registered: request auto-expiry (every 30 min), stale reservation cleanup (every 10 min)');
}
