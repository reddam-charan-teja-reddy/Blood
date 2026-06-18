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
}, {
  timestamps: true,
});

UserSchema.index({ role: 1 });

export const User = mongoose.model('User', UserSchema);
