import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['INDIVIDUAL', 'ORG', 'ADMIN'],
    required: true,
  },
  passwordHash: {
    type: String,
  },
  suspended: {
    type: Boolean,
    default: false,
  },
  suspendedReason: {
    type: String,
  },
  restrictRequestUntil: {
    type: Date,
  },
  tokenVersion: {
    type: Number,
    default: 0,
  },
  // Patient-convenience fields
  guardianName: {
    type: String,
  },
  guardianPhone: {
    type: String,
  },
  preferredContact: {
    type: String,
    enum: ['PHONE', 'WHATSAPP', 'APP'],
    default: 'PHONE',
  },
  // Regional Moderation / Scoped Admin Capabilities
  moderationCity: {
    type: String,
    trim: true,
  },
  moderationRadiusKm: {
    type: Number,
  },
  moderationLocation: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined,
    },
  },
}, {
  timestamps: true,
});

UserSchema.index({ moderationLocation: '2dsphere' }, { sparse: true });

UserSchema.index({ role: 1 });

export const User = mongoose.model('User', UserSchema);
