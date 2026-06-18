import mongoose from 'mongoose';

const BloodRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  requesterType: {
    type: String,
    enum: ['INDIVIDUAL', 'ORG'],
    required: true,
  },
  patientAnonymous: { type: Boolean, default: false },

  // Blood details
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: true,
  },
  component: {
    type: String,
    enum: ['WHOLE_BLOOD', 'PLATELETS', 'PLASMA', 'RBC'],
    required: true,
  },
  unitsNeeded: { type: Number, required: true, min: 1, max: 10 },
  /**
   * unitsConfirmed tracks units with a DONATED outcome, NOT contact reveals.
   * It is incremented only in reportOutcome when outcome === 'DONATED'.
   * A contact reveal is just a handshake — not a guarantee of donation.
   */
  unitsConfirmed: { type: Number, default: 0 },
  urgency: {
    type: String,
    enum: ['EMERGENCY', 'HIGH', 'NORMAL'],
    required: true,
  },
  requiredBy: { type: Date, required: true },

  // Hospital Details
  hospitalName: { type: String, required: true, trim: true },
  hospitalCity: { type: String, required: true, trim: true },
  hospitalState: { type: String, required: true, trim: true },

  // ── Hospital Location ────────────────────────────────────────────────────
  /**
   * GeoJSON Point for the hospital location.
   * Used for $near queries to find donors close to the hospital.
   * Captured from browser geolocation on request creation.
   * Coordinates: [longitude, latitude]
   */
  hospitalLocation: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined,
    },
  },
  // ─────────────────────────────────────────────────────────────────────────

  // Sensitive Fields — only revealed via OTP confirm
  wardNumber: { type: String, trim: true },
  attendingDoctor: { type: String, trim: true },
  guardianPhoneOverride: { type: String, trim: true },

  // Expiry / Status
  status: {
    type: String,
    enum: ['ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE',
  },
  expiresAt: { type: Date, required: true },
  fulfilledAt: { type: Date },

  // Extension tracking — max 2 extensions enforced in extendRequest controller
  extensionCount: { type: Number, default: 0 },

  shareToken: { type: String, unique: true, sparse: true },

  // Abuse / moderation flags
  flagCount: { type: Number, default: 0 },
  isFlagged: { type: Boolean, default: false },
  /**
   * Array of User ObjectIds who have flagged this request.
   * Enforces one-flag-per-user. Auto-elevates isFlagged at >= 5 distinct flags.
   */
  flaggedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  documentPath: { type: String },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
/**
 * 2dsphere on hospitalLocation — enables:
 *   - $near queries to find donors within X km of hospital
 *   - Org supply feed ($geoWithin org's service radius)
 */
BloodRequestSchema.index({ hospitalLocation: '2dsphere' }, { sparse: true });

// Existing compound index retained for blood group + status text queries (fallback)
BloodRequestSchema.index({ status: 1, bloodGroup: 1, hospitalCity: 1 });
BloodRequestSchema.index({ requesterId: 1 });

export const BloodRequest = mongoose.model('BloodRequest', BloodRequestSchema);
