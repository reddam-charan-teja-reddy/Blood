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
  lastWholeBloodDonation: {
    type: Date,
  },
  lastPlateletDonation: {
    type: Date,
  },
  lastPlasmaDonation: {
    type: Date,
  },
  // Eligibility fields
  weightKg: {
    type: Number,
  },
  plateletEligible: {
    type: Boolean,
    default: false,
  },
  tempDeferralUntil: {
    type: Date,
  },
  tempDeferralReason: {
    type: String,
  },
  // Availability status
  available: {
    type: Boolean,
    default: false,
  },
  // Location details
  city: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    required: true,
    trim: true,
  },
  pincode: {
    type: String,
    trim: true,
  },
  notificationRadiusKm: {
    type: Number,
    default: 10,
  },
  // Reputation details
  totalDonations: {
    type: Number,
    default: 0,
  },
  noShowCount: {
    type: Number,
    default: 0,
  },
  responseRate: {
    type: Number,
    default: null,
  },
  // Notification preferences
  notifSmsEmergency: {
    type: Boolean,
    default: true,
  },
  notifMaxPerDay: {
    type: Number,
    default: 5,
  },
  quietHoursStart: {
    type: String, // format "HH:MM"
  },
  quietHoursEnd: {
    type: String, // format "HH:MM"
  },
}, {
  timestamps: true,
});

DonorProfileSchema.index({ bloodGroup: 1, available: 1, city: 1 });

export const DonorProfile = mongoose.model('DonorProfile', DonorProfileSchema);
