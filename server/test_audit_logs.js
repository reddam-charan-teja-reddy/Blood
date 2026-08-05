import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { User } from './src/models/User.js';
import { AuditLog } from './src/models/AuditLog.js';
import { suspendUser, getAuditLogs } from './src/controllers/admin.controller.js';

console.log('🧪 Starting Audit Log integration tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    await User.deleteMany({ email: /test-audit/ });
    await AuditLog.deleteMany({});

    // 1. Create Admin and Target User
    const admin = await User.create({
      fullName: 'Super Admin',
      phone: '+919999999988',
      email: 'test-audit-admin@example.com',
      role: 'ADMIN',
      phoneVerified: true,
    });

    const targetUser = await User.create({
      fullName: 'Spammy User',
      phone: '+919999999989',
      email: 'test-audit-target@example.com',
      role: 'INDIVIDUAL',
      phoneVerified: true,
    });

    // 2. Perform suspendUser action
    console.log('  Executing suspendUser via admin...');
    const req = {
      params: { id: targetUser._id.toString() },
      body: { reason: 'Abusive spamming of blood requests' },
      user: { id: admin._id.toString(), role: 'ADMIN' },
      ip: '127.0.0.1',
    };

    let responseData = null;
    const res = {
      status(code) { return this; },
      json(data) { responseData = data; return this; }
    };
    const next = (err) => { if (err) throw err; };

    await suspendUser(req, res, next);

    if (!responseData || !responseData.success) {
      throw new Error(`suspendUser failed: ${JSON.stringify(responseData)}`);
    }

    // 3. Verify AuditLog document created
    console.log('  Verifying AuditLog record creation...');
    const logs = await AuditLog.find({ adminId: admin._id });
    if (logs.length !== 1) {
      throw new Error(`Expected 1 audit log, got ${logs.length}`);
    }

    const log = logs[0];
    if (log.action !== 'SUSPEND_USER' || log.targetId.toString() !== targetUser._id.toString()) {
      throw new Error(`Audit log content mismatch: ${JSON.stringify(log)}`);
    }
    if (log.reason !== 'Abusive spamming of blood requests') {
      throw new Error(`Audit log reason mismatch: ${log.reason}`);
    }
    console.log('  ✅ AuditLog record verified with action, targetId, and reason.');

    // 4. Test getAuditLogs controller
    console.log('  Testing getAuditLogs query...');
    let queryResponse = null;
    const queryRes = {
      status(code) { return this; },
      json(data) { queryResponse = data; return this; }
    };
    await getAuditLogs({ query: { page: 1, limit: 10, action: 'SUSPEND_USER' } }, queryRes, next);

    if (!queryResponse || queryResponse.total !== 1 || queryResponse.logs.length !== 1) {
      throw new Error(`getAuditLogs failed: ${JSON.stringify(queryResponse)}`);
    }
    console.log('  ✅ getAuditLogs controller returns paginated and filtered audit trail.');

    // Cleanup
    await User.deleteMany({ _id: { $in: [admin._id, targetUser._id] } });
    await AuditLog.deleteMany({ adminId: admin._id });

    console.log('\n========================================');
    console.log('🎉 Audit Log system integration tests PASSED!');
    console.log('========================================\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Audit Log test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
