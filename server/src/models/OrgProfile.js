import mongoose from 'mongoose';

const OrgProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  orgName: {
    type: String,
    required: true,
    trim: true,
  },
  registrationNo: {
    type: String,
    required: true,
    trim: true,
  },
  orgType: {
    type: String,
    enum: ['HOSPITAL', 'BLOOD_BANK', 'NGO'],
    required: true,
  },
  address: {
    type: String,
    trim: true,
  },
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
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING',
  },
  verifiedAt: {
    type: Date,
  },
  inventory: {
    'A+': { type: Number, default: 0, min: 0 },
    'A-': { type: Number, default: 0, min: 0 },
    'B+': { type: Number, default: 0, min: 0 },
    'B-': { type: Number, default: 0, min: 0 },
    'AB+': { type: Number, default: 0, min: 0 },
    'AB-': { type: Number, default: 0, min: 0 },
    'O+': { type: Number, default: 0, min: 0 },
    'O-': { type: Number, default: 0, min: 0 },
  },
}, {
  timestamps: true,
});

export const OrgProfile = mongoose.model('OrgProfile', OrgProfileSchema);
