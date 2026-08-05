import mongoose from 'mongoose';

const DonorProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  bloodGroupVerified: {
    type: Boolean,
    default: false,
  },
  // Last donation dates per component
  lastWholeBloodDonation: { type: Date },
  lastPlateletDonation: { type: Date },
  lastPlasmaDonation: { type: Date },

  // Eligibility fields
  weightKg: { type: Number },
  plateletEligible: { type: Boolean, default: false },
  tempDeferralUntil: { type: Date },
  tempDeferralReason: { type: String },

  // Availability status
  available: { type: Boolean, default: false },

  // ── Location ──────────────────────────────────────────────────────────────
  // `city` and `state` are kept for human-readable display and text-search
  // fallback. `location` is the canonical field for ALL geospatial queries.
  // Coordinates format: [longitude, latitude] — MongoDB / GeoJSON standard.
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  pincode: { type: String, trim: true },

  /**
   * GeoJSON Point — drives all $near / $geoWithin donor queries.
   * Set from browser navigator.geolocation on registration / profile update.
   * If the user denies permission, coordinates stay undefined and the system
   * falls back to city-string matching (city field) for backward compatibility.
   */
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      // [longitude, latitude] — GeoJSON order
      type: [Number],
      default: undefined,
    },
  },

  /**
   * Radius (km) within which this donor accepts request notifications.
   * Converted to metres when building the $near query:
   *   maxDistance: notificationRadiusKm * 1000
   * Default raised to 25 km — a practical urban commute distance in India.
   */
  notificationRadiusKm: { type: Number, default: 25 },
  // ─────────────────────────────────────────────────────────────────────────

  // Reputation
  totalDonations: { type: Number, default: 0 },
  noShowCount: { type: Number, default: 0 },
  responseRate: { type: Number, default: null },
  reputationScore: { type: Number, default: 50 },

  // Notification preferences
  notifSmsEmergency: { type: Boolean, default: true },
  notifMaxPerDay: { type: Number, default: 5 },
  quietHoursStart: { type: String }, // "HH:MM"
  quietHoursEnd: { type: String },   // "HH:MM"

  documentPath: { type: String },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
/**
 * 2dsphere index — required for $near, $nearSphere, $geoWithin operators.
 * sparse:true means documents that have no `location` field are skipped,
 * keeping the index lean and backward compatible with pre-migration documents.
 */
DonorProfileSchema.index({ location: '2dsphere' }, { sparse: true });

// Compound index for blood group + city text fallback searches.
DonorProfileSchema.index({ bloodGroup: 1, available: 1, city: 1 });

export const DonorProfile = mongoose.model('DonorProfile', DonorProfileSchema);
