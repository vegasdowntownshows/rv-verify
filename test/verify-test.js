const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Use a temporary test DB
process.env.DB_PATH = './test_rv_verify.sqlite';

const database = require('../src/services/database');
const FingerprintService = require('../src/services/fingerprint');
const VpnDetector = require('../src/services/vpnDetector');

async function runTests() {
  console.log('🧪 Starting RV VERIFY Comprehensive Anti-Alt Tests...\n');

  // Test 1: Fingerprint Generation & Hashing
  console.log('Test 1: Hardware Fingerprint Normalization & Hashing');
  const fp1 = {
    canvasHash: 'a1b2c3d4e5f6',
    audioHash: 'f6e5d4c3b2a1',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080)',
    webglVendor: 'Google Inc.',
    screenRes: '1920x1080@24',
    cpuCores: 16,
    ramGb: 32,
    timezone: 'America/New_York',
    platform: 'Win32'
  };

  const combined1 = FingerprintService.generateCombinedFingerprint(fp1);
  assert.ok(combined1, 'Combined fingerprint should be generated');
  assert.strictEqual(typeof combined1, 'string');
  assert.strictEqual(combined1.length, 64, 'SHA-256 hash length should be 64 hex characters');
  console.log('  ✓ Fingerprint hash generated correctly:', combined1.substring(0, 16) + '...');

  // Test 2: Automation Detection
  console.log('\nTest 2: Bot Farm & Headless Browser Detection');
  const cleanEnv = FingerprintService.detectAutomation({ webdriver: false, hasCdcProps: false, pluginCount: 5, languagesCount: 2 }, 'Mozilla/5.0');
  assert.strictEqual(cleanEnv.isAutomated, false, 'Regular browser should not be flagged as automated');

  const botEnv = FingerprintService.detectAutomation({ webdriver: true, hasCdcProps: true, pluginCount: 0, languagesCount: 0 }, 'Mozilla/5.0 HeadlessChrome/118.0');
  assert.strictEqual(botEnv.isAutomated, true, 'Headless chrome with webdriver should be flagged');
  assert.ok(botEnv.flags.includes('webdriver_active'));
  assert.ok(botEnv.flags.includes('headless_user_agent'));
  console.log('  ✓ Bot flags successfully caught:', botEnv.flags.join(', '));

  // Test 3: First User (Main Account) Verification
  console.log('\nTest 3: First User Verification (Main Account: 111111111)');
  database.upsertUser('111111111', {
    username: 'GamblerKing#1337',
    avatar: 'avatar_hash_1',
    accountCreatedAt: new Date('2024-01-01').toISOString()
  });

  database.recordVerification({
    discordId: '111111111',
    guildId: '999999999',
    ip: '198.51.100.5',
    deviceUuid: 'rv_token_device_unique_xyz',
    canvasHash: fp1.canvasHash,
    webglRenderer: fp1.webglRenderer,
    webglVendor: fp1.webglVendor,
    audioHash: fp1.audioHash,
    screenRes: fp1.screenRes,
    cpuCores: fp1.cpuCores,
    ramGb: fp1.ramGb,
    timezone: fp1.timezone,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    combinedFingerprint: combined1,
    isVpn: false,
    status: 'VERIFIED'
  });
  console.log('  ✓ Main account verified and logged in database.');

  // Test 4: Alt Account Attempt (Account 222222222 from same PC / browser profile)
  console.log('\nTest 4: Alt Account Attempt (Alt Account: 222222222)');
  database.upsertUser('222222222', {
    username: 'FreeBonusFarmer#4444',
    avatar: 'avatar_hash_2',
    accountCreatedAt: new Date('2026-10-10').toISOString()
  });

  const altCheckData = {
    deviceUuid: 'rv_token_device_unique_xyz', // Same persistent device token!
    combinedFingerprint: combined1,
    canvasHash: fp1.canvasHash,
    webglRenderer: fp1.webglRenderer,
    audioHash: fp1.audioHash,
    ip: '198.51.100.5'
  };

  const detectedAlts = database.findPotentialAlts('222222222', altCheckData);
  assert.ok(detectedAlts.length > 0, 'Should detect potential alts');
  console.log(`  ✓ Successfully detected ${detectedAlts.length} alt link vector(s)!`);

  const topMatch = detectedAlts[0];
  console.log(`  ✓ Matched Main Discord ID: ${topMatch.discord_id}`);
  console.log(`  ✓ Match Vector: ${topMatch.vector} (Confidence: ${topMatch.confidence}%)`);
  assert.strictEqual(topMatch.discord_id, '111111111');
  assert.strictEqual(topMatch.confidence, 100);

  // Record alt link in database
  database.recordAltLink('222222222', '111111111', topMatch.vector, topMatch.confidence);

  // Test 5: Graph Cluster Traversal (Revealing ALL Alts)
  console.log('\nTest 5: Graph Cluster Traversal (Third Alt: 333333333)');
  database.upsertUser('333333333', {
    username: 'BonusFarmerAlt3#9999',
    avatar: 'avatar_hash_3',
    accountCreatedAt: new Date('2026-10-12').toISOString()
  });
  database.recordAltLink('333333333', '222222222', 'CANVAS_GPU_AUDIO', 95);

  const fullCluster = database.getAllConnectedAlts('333333333');
  console.log(`  ✓ Querying full network cluster for 333333333 reveals ${fullCluster.length} connected accounts:`);
  fullCluster.forEach((alt, idx) => {
    console.log(`    [${idx + 1}] Connected Account: ${alt.alt_id} (${alt.username || 'Unknown'}) via ${alt.match_vector}`);
  });

  const connectedIds = fullCluster.map(c => c.alt_id);
  assert.ok(connectedIds.includes('222222222'), 'Should include direct link');
  assert.ok(connectedIds.includes('111111111'), 'Should traverse transitive graph to find original main account');

  // Test 6: Whitelist & Blacklist Controls
  console.log('\nTest 6: Whitelist and Blacklist Testing');
  database.setUserWhitelist('111111111', true, 'Verified Streamer / Shared PC');
  const userAfterWl = database.getUser('111111111');
  assert.strictEqual(userAfterWl.is_whitelisted, 1);
  assert.strictEqual(userAfterWl.whitelist_reason, 'Verified Streamer / Shared PC');
  console.log('  ✓ Whitelist successfully toggled and verified.');

  database.setUserBlacklist('333333333', true, 'Bonus Raid abuser');
  const userAfterBl = database.getUser('333333333');
  assert.strictEqual(userAfterBl.is_blacklisted, 1);
  console.log('  ✓ Blacklist successfully toggled and verified.');

  // Test 7: Guild Statistics
  console.log('\nTest 7: Verification Statistics Calculation');
  const stats = database.getStats('999999999');
  console.log('  ✓ Stats output:', stats);
  assert.strictEqual(typeof stats.totalVerified, 'number');

  // Clean up test DB
  database.db.close();
  try {
    if (fs.existsSync('./test_rv_verify.sqlite')) fs.unlinkSync('./test_rv_verify.sqlite');
    if (fs.existsSync('./test_rv_verify.sqlite-wal')) fs.unlinkSync('./test_rv_verify.sqlite-wal');
    if (fs.existsSync('./test_rv_verify.sqlite-shm')) fs.unlinkSync('./test_rv_verify.sqlite-shm');
  } catch (e) {}

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! RV VERIFY ANTI-ALT SYSTEM FULLY OPERATIONAL.\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
