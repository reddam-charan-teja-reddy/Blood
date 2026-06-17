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
  patientAnonymous: {
    type: Boolean,
    default: false,
  },
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
  unitsNeeded: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
  unitsConfirmed: {
    type: Number,
    default: 0,
  },
  urgency: {
    type: String,
    enum: ['EMERGENCY', 'HIGH', 'NORMAL'],
    required: true,
  },
  requiredBy: {
    type: Date,
    required: true,
  },
  // Hospital Details
  hospitalName: {
    type: String,
    required: true,
    trim: true,
  },
  hospitalCity: {
    type: String,
    required: true,
    trim: true,
  },
  hospitalState: {
    type: String,
    required: true,
    trim: true,
  },
  // Sensitive Fields (revealed via OTP reveal)
  wardNumber: {
    type: String,
    trim: true,
  },
  attendingDoctor: {
    type: String,
    trim: true,
  },
  guardianPhoneOverride: {
    type: String,
    trim: true,
  },
  // Expiry / Status
  status: {
    type: String,
    enum: ['ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  fulfilledAt: {
    type: Date,
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  // Abuse / moderation flags
  flagCount: {
    type: Number,
    default: 0,
  },
  isFlagged: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

BloodRequestSchema.index({ status: 1, bloodGroup: 1, hospitalCity: 1 });
BloodRequestSchema.index({ requesterId: 1 });

export const BloodRequest = mongoose.model('BloodRequest', BloodRequestSchema);
