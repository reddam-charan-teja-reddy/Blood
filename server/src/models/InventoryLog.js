import mongoose from 'mongoose';

const InventoryLogSchema = new mongoose.Schema({
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrgProfile',
    required: true,
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: true,
  },
  delta: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

InventoryLogSchema.index({ orgId: 1, createdAt: -1 });

export const InventoryLog = mongoose.model('InventoryLog', InventoryLogSchema);
