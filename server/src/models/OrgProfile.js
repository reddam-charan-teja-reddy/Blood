import mongoose from 'mongoose';

const OrgProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  orgName: { type: String, required: true, trim: true },
  registrationNo: { type: String, required: true, trim: true },
  orgType: {
    type: String,
    enum: ['HOSPITAL', 'BLOOD_BANK', 'NGO'],
    required: true,
  },
  address: { type: String, trim: true },

  // ── Location ──────────────────────────────────────────────────────────────
  // city + state kept for display. location drives geospatial queries.
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  pincode: { type: String, trim: true },

  /**
   * GeoJSON Point — enables $near queries to find orgs near a blood request
   * and to allow the org to browse requests near their facility.
   * Coordinates: [longitude, latitude]
   */
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined,
    },
  },

  /**
   * Org service radius in km — requests posted within this radius
   * from the org's location will appear in the org's supply feed.
   */
  serviceRadiusKm: { type: Number, default: 50 },
  // ─────────────────────────────────────────────────────────────────────────

  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING',
  },
  verifiedAt: { type: Date },
  rejectionReason: { type: String }, // stored so org knows WHY they were rejected

  // Blood inventory (units on hand — absolute values per blood group)
  inventory: {
    'A+':  { type: Number, default: 0, min: 0 },
    'A-':  { type: Number, default: 0, min: 0 },
    'B+':  { type: Number, default: 0, min: 0 },
    'B-':  { type: Number, default: 0, min: 0 },
    'AB+': { type: Number, default: 0, min: 0 },
    'AB-': { type: Number, default: 0, min: 0 },
    'O+':  { type: Number, default: 0, min: 0 },
    'O-':  { type: Number, default: 0, min: 0 },
  },
  documentPath: { type: String },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
/**
 * 2dsphere index for geospatial org queries:
 *   - Finding orgs near a critical request (notification fan-out)
 *   - Org browsing blood requests within their service radius
 */
OrgProfileSchema.index({ location: '2dsphere' }, { sparse: true });
OrgProfileSchema.index({ verificationStatus: 1 });

export const OrgProfile = mongoose.model('OrgProfile', OrgProfileSchema);
