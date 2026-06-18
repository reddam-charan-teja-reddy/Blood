import mongoose from 'mongoose';

const DisputeSchema = new mongoose.Schema({
  interestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DonorInterest',
  },
  type: {
    type: String,
    enum: ['NO_SHOW_PENALTY', 'RESTRICTION'],
    default: 'NO_SHOW_PENALTY',
  },
  filedById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  evidence: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['OPEN', 'RESOLVED', 'OVERTURNED'],
    default: 'OPEN',
  },
}, {
  timestamps: true,
});

DisputeSchema.index({ status: 1 });
DisputeSchema.index({ filedById: 1 });

export const Dispute = mongoose.model('Dispute', DisputeSchema);
