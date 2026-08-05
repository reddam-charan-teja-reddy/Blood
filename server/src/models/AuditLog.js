import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'SUSPEND_USER',
      'UNSUSPEND_USER',
      'CLEAR_NOSHOWS',
      'VERIFY_ORG',
      'REJECT_ORG',
      'APPROVE_PROOF',
      'REJECT_PROOF',
      'CLEAR_FLAGS',
      'CANCEL_REQUEST',
      'RESOLVE_DISPUTE',
      'OVERTURN_DISPUTE',
      'UPDATE_SCOPE',
    ],
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  targetModel: {
    type: String,
    required: true,
    enum: ['User', 'OrgProfile', 'DonorProfile', 'BloodRequest', 'Dispute'],
  },
  reason: {
    type: String,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  ipAddress: {
    type: String,
  },
}, {
  timestamps: true,
});

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1 });

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
