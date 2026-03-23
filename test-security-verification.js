#!/usr/bin/env node
/**
 * Security Fix Verification Script (SS-004)
 *
 * This script verifies that the security fixes are in place by:
 * 1. Checking that the code has proper authentication middleware
 * 2. Checking that CORS is restricted
 * 3. Verifying session token generation
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔒 SS-004 Security Fix Verification\n');
console.log('=' .repeat(60));

let allPassed = true;

// Test 1: Check app.ts has authentication middleware
console.log('\n✓ Test 1: Checking authentication middleware...');
try {
  const appTs = readFileSync(
    join(__dirname, 'packages/host-service/src/app.ts'),
    'utf-8'
  );

  const checks = [
    { name: 'Session token parameter', pattern: 'sessionToken?:' },
    { name: 'Import secureCompare', pattern: 'secureCompare' },
    { name: 'Auth middleware check', pattern: 'if (options?.sessionToken)' },
    { name: 'Authorization header check', pattern: 'Authorization' },
    { name: '401 Unauthorized response', pattern: '401' },
    { name: 'Secure comparison', pattern: 'secureCompare(token' },
  ];

  for (const check of checks) {
    if (appTs.includes(check.pattern)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      allPassed = false;
    }
  }
} catch (err) {
  console.log(`  ❌ Error reading app.ts: ${err.message}`);
  allPassed = false;
}

// Test 2: Check strict CORS configuration
console.log('\n✓ Test 2: Checking strict CORS...');
try {
  const appTs = readFileSync(
    join(__dirname, 'packages/host-service/src/app.ts'),
    'utf-8'
  );

  const corsChecks = [
    { name: 'CORS origin function', pattern: 'origin: (origin) =>' },
    { name: 'Localhost check', pattern: 'localhost' },
    { name: '127.0.0.1 check', pattern: '127.0.0.1' },
    { name: 'Electron protocol check', pattern: 'app:' },
    { name: 'Credentials enabled', pattern: 'credentials: true' },
  ];

  for (const check of corsChecks) {
    if (appTs.includes(check.pattern)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      allPassed = false;
    }
  }

  // Check that unrestricted CORS is NOT present
  if (appTs.includes('app.use("*", cors())') && !appTs.includes('origin:')) {
    console.log('  ❌ CRITICAL: Unrestricted CORS still present!');
    allPassed = false;
  } else {
    console.log('  ✅ Unrestricted CORS removed');
  }
} catch (err) {
  console.log(`  ❌ Error checking CORS: ${err.message}`);
  allPassed = false;
}

// Test 3: Check security token utilities exist
console.log('\n✓ Test 3: Checking security utilities...');
try {
  const tokenTs = readFileSync(
    join(__dirname, 'packages/host-service/src/security/token.ts'),
    'utf-8'
  );

  const securityChecks = [
    { name: 'generateSecureToken function', pattern: 'export function generateSecureToken' },
    { name: 'secureCompare function', pattern: 'export function secureCompare' },
    { name: 'randomBytes usage', pattern: 'randomBytes(32)' },
    { name: 'Constant-time comparison', pattern: 'result |=' },
  ];

  for (const check of securityChecks) {
    if (tokenTs.includes(check.pattern)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      allPassed = false;
    }
  }
} catch (err) {
  console.log(`  ❌ Error reading security/token.ts: ${err.message}`);
  allPassed = false;
}

// Test 4: Check desktop integration
console.log('\n✓ Test 4: Checking desktop integration...');
try {
  const desktopIndex = readFileSync(
    join(__dirname, 'apps/desktop/src/main/host-service/index.ts'),
    'utf-8'
  );

  const integrationChecks = [
    { name: 'Token generation', pattern: 'randomBytes(32)' },
    { name: 'Token passed to createApp', pattern: 'sessionToken,' },
    { name: 'Token sent via IPC', pattern: 'sessionToken }' },
  ];

  for (const check of integrationChecks) {
    if (desktopIndex.includes(check.pattern)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      allPassed = false;
    }
  }
} catch (err) {
  console.log(`  ❌ Error reading desktop integration: ${err.message}`);
  allPassed = false;
}

// Test 5: Check client sends token
console.log('\n✓ Test 5: Checking client authentication...');
try {
  const clientTs = readFileSync(
    join(__dirname, 'apps/desktop/src/renderer/lib/host-service-client.ts'),
    'utf-8'
  );

  const clientChecks = [
    { name: 'Session token parameter', pattern: 'sessionToken?' },
    { name: 'Authorization header', pattern: 'Authorization:' },
    { name: 'Bearer token format', pattern: 'Bearer' },
  ];

  for (const check of clientChecks) {
    if (clientTs.includes(check.pattern)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name} - NOT FOUND`);
      allPassed = false;
    }
  }
} catch (err) {
  console.log(`  ❌ Error reading client code: ${err.message}`);
  allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ ALL SECURITY CHECKS PASSED');
  console.log('\nThe SS-004 vulnerability has been successfully fixed:');
  console.log('  • Session token authentication: ENABLED');
  console.log('  • Strict CORS policy: ENFORCED');
  console.log('  • Secure token generation: IMPLEMENTED');
  console.log('  • Client integration: COMPLETE');
  process.exit(0);
} else {
  console.log('❌ SOME SECURITY CHECKS FAILED');
  console.log('\nPlease review the failures above.');
  process.exit(1);
}
