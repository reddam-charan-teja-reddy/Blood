import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  /**
   * The user who receives this notification.
   * Named `userId` consistently across all models.
   * (Previously `recipientId` — unified for consistency.)
   */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'EMERGENCY_REQUEST',   // critical blood request in donor's area
      'NEW_REQUEST_MATCH',   // new request that matches donor's blood group & location
      'CONTACT_REVEALED',    // donor's contact was revealed by a requester
      'OUTCOME_REPORTED',    // outcome reported on a donation the donor participated in
      'ORG_VERIFIED',        // org account approved by admin
      'ORG_REJECTED',        // org account rejected by admin
      'PROOF_APPROVED',      // blood group proof approved
      'PROOF_REJECTED',      // blood group proof rejected
      'GENERAL',             // catch-all for system messages
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  /**
   * Deep link — frontend navigates here when the notification is tapped.
   * Example: `/request/6849abc123...`
   */
  link: {
    type: String,
    trim: true,
  },
  relatedRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BloodRequest',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// Primary query: "get all unread notifications for user X, newest first"
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// TTL index: auto-delete read notifications after 30 days to keep collection lean
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { isRead: true } }
);

export const Notification = mongoose.model('Notification', NotificationSchema);
