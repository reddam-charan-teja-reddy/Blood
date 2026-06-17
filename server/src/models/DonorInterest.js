import mongoose from 'mongoose';

const DonorInterestSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BloodRequest',
    required: true,
  },
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: [
      'INTERESTED',
      'REVEAL_PENDING',
      'CONTACT_REVEALED',
      'CONFIRMED',
      'DONATED',
      'TURNED_AWAY',
      'NO_SHOW',
      'DECLINED',
      'WITHDRAWN',
    ],
    default: 'INTERESTED',
  },
  eta: {
    type: Date,
  },
  contactRevealedAt: {
    type: Date,
  },
  outcomeReportedAt: {
    type: Date,
  },
  outcomeReason: {
    type: String, // Reason if turned away or declined
  },
}, {
  timestamps: true,
});

DonorInterestSchema.index({ requestId: 1, donorId: 1 }, { unique: true });
DonorInterestSchema.index({ donorId: 1, status: 1 });

export const DonorInterest = mongoose.model('DonorInterest', DonorInterestSchema);
