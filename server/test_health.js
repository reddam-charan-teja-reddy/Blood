process.env.NODE_ENV = 'test';
import mongoose from 'mongoose';
import { app } from './src/app.js';
import { config } from './src/config/env.js';

console.log('🧪 Starting Health Check endpoint tests...');

async function run() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('  Connected to MongoDB.');

    // Wait a brief moment for redis connection to register
    await new Promise(r => setTimeout(r, 200));

    let responseData = null;
    let statusCode = 200;

    const req = {
      headers: {},
      method: 'GET',
      url: '/api/v1/health'
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
      setHeader() {},
    };

    const healthRoute = app._router.stack
      .find(layer => layer.route && layer.route.path === '/api/v1/health');

    if (!healthRoute) {
      throw new Error('/api/v1/health route not registered on Express app');
    }

    await healthRoute.route.stack[0].handle(req, res);

    if (!responseData || responseData.status !== 'UP') {
      throw new Error(`Health check returned non-UP status: ${JSON.stringify(responseData)}`);
    }

    if (responseData.services.mongodb !== 'CONNECTED') {
      throw new Error(`MongoDB service report mismatch: ${responseData.services.mongodb}`);
    }

    console.log('  Health check output:');
    console.log(`    Status: ${responseData.status}`);
    console.log(`    Uptime: ${Math.round(responseData.uptime)}s`);
    console.log(`    MongoDB: ${responseData.services.mongodb}`);
    console.log(`    Redis: ${responseData.services.redis}`);
    console.log(`    Memory (RSS): ${responseData.memoryUsage.rssMb}MB`);

    console.log('\n========================================');
    console.log('🎉 Health check endpoint tests PASSED!');
    console.log('========================================\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Health check test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
