const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config');

// Ensure DB directory exists
const dbPath = path.resolve(config.database.path);
const db = new Database(dbPath);

// Enable WAL mode for optimal concurrent performance
db.pragma('journal_mode = WAL');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      verified_role_id TEXT,
      unverified_role_id TEXT,
      log_channel_id TEXT,
      verify_channel_id TEXT,
      strict_alt_block INTEGER DEFAULT 1,
      block_vpn INTEGER DEFAULT 1,
      min_account_age_days INTEGER DEFAULT 3,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT,
      avatar TEXT,
      account_created_at DATETIME,
      first_verified_at DATETIME,
      last_verified_at DATETIME,
      is_whitelisted INTEGER DEFAULT 0,
      whitelist_reason TEXT,
      is_blacklisted INTEGER DEFAULT 0,
      blacklist_reason TEXT,
      trust_score INTEGER DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      guild_id TEXT,
      ip TEXT,
      device_uuid TEXT,
      canvas_hash TEXT,
      webgl_renderer TEXT,
      webgl_vendor TEXT,
      audio_hash TEXT,
      screen_res TEXT,
      cpu_cores INTEGER,
      ram_gb REAL,
      timezone TEXT,
      user_agent TEXT,
      combined_fingerprint TEXT,
      is_vpn INTEGER DEFAULT 0,
      vpn_details TEXT,
      is_incognito INTEGER DEFAULT 0,
      is_automated INTEGER DEFAULT 0,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alt_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id_1 TEXT,
      discord_id_2 TEXT,
      match_vector TEXT,
      confidence INTEGER,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(discord_id_1, discord_id_2, match_vector)
    );

    CREATE TABLE IF NOT EXISTS verification_sessions (
      token TEXT PRIMARY KEY,
      discord_id TEXT,
      guild_id TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_verif_discord_id ON verifications(discord_id);
    CREATE INDEX IF NOT EXISTS idx_verif_ip ON verifications(ip);
    CREATE INDEX IF NOT EXISTS idx_verif_device_uuid ON verifications(device_uuid);
    CREATE INDEX IF NOT EXISTS idx_verif_combined_fingerprint ON verifications(combined_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_verif_canvas_hash ON verifications(canvas_hash);
    CREATE INDEX IF NOT EXISTS idx_alt_links_1 ON alt_links(discord_id_1);
    CREATE INDEX IF NOT EXISTS idx_alt_links_2 ON alt_links(discord_id_2);
  `);
}

initSchema();

module.exports = {
  db,

  // Settings
  getGuildSettings(guildId) {
    const stmt = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
    return stmt.get(guildId);
  },

  setGuildSettings(guildId, settings) {
    const existing = this.getGuildSettings(guildId);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE guild_settings
        SET verified_role_id = COALESCE(?, verified_role_id),
            unverified_role_id = COALESCE(?, unverified_role_id),
            log_channel_id = COALESCE(?, log_channel_id),
            verify_channel_id = COALESCE(?, verify_channel_id),
            strict_alt_block = COALESCE(?, strict_alt_block),
            block_vpn = COALESCE(?, block_vpn),
            min_account_age_days = COALESCE(?, min_account_age_days),
            updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ?
      `);
      return stmt.run(
        settings.verifiedRoleId,
        settings.unverifiedRoleId,
        settings.logChannelId,
        settings.verifyChannelId,
        settings.strictAltBlock !== undefined ? (settings.strictAltBlock ? 1 : 0) : null,
        settings.blockVpn !== undefined ? (settings.blockVpn ? 1 : 0) : null,
        settings.minAccountAgeDays,
        guildId
      );
    } else {
      const stmt = db.prepare(`
        INSERT INTO guild_settings (
          guild_id, verified_role_id, unverified_role_id, log_channel_id,
          verify_channel_id, strict_alt_block, block_vpn, min_account_age_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      return stmt.run(
        guildId,
        settings.verifiedRoleId || null,
        settings.unverifiedRoleId || null,
        settings.logChannelId || null,
        settings.verifyChannelId || null,
        settings.strictAltBlock ? 1 : 1,
        settings.blockVpn ? 1 : 1,
        settings.minAccountAgeDays || 3
      );
    }
  },

  // User management
  getUser(discordId) {
    const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
    return stmt.get(discordId);
  },

  upsertUser(discordId, data) {
    const existing = this.getUser(discordId);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE users
        SET username = COALESCE(?, username),
            avatar = COALESCE(?, avatar),
            last_verified_at = CURRENT_TIMESTAMP
        WHERE discord_id = ?
      `);
      stmt.run(data.username, data.avatar, discordId);
      return this.getUser(discordId);
    } else {
      const stmt = db.prepare(`
        INSERT INTO users (discord_id, username, avatar, account_created_at, first_verified_at, last_verified_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      stmt.run(discordId, data.username, data.avatar, data.accountCreatedAt || null);
      return this.getUser(discordId);
    }
  },

  setUserWhitelist(discordId, isWhitelisted, reason = '') {
    this.upsertUser(discordId, {});
    const stmt = db.prepare('UPDATE users SET is_whitelisted = ?, whitelist_reason = ? WHERE discord_id = ?');
    return stmt.run(isWhitelisted ? 1 : 0, reason, discordId);
  },

  setUserBlacklist(discordId, isBlacklisted, reason = '') {
    this.upsertUser(discordId, {});
    const stmt = db.prepare('UPDATE users SET is_blacklisted = ?, blacklist_reason = ? WHERE discord_id = ?');
    return stmt.run(isBlacklisted ? 1 : 0, reason, discordId);
  },

  // Verification recording
  recordVerification(data) {
    const stmt = db.prepare(`
      INSERT INTO verifications (
        discord_id, guild_id, ip, device_uuid, canvas_hash,
        webgl_renderer, webgl_vendor, audio_hash, screen_res,
        cpu_cores, ram_gb, timezone, user_agent, combined_fingerprint,
        is_vpn, vpn_details, is_incognito, is_automated, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.discordId,
      data.guildId,
      data.ip,
      data.deviceUuid,
      data.canvasHash,
      data.webglRenderer,
      data.webglVendor,
      data.audioHash,
      data.screenRes,
      data.cpuCores,
      data.ramGb,
      data.timezone,
      data.userAgent,
      data.combinedFingerprint,
      data.isVpn ? 1 : 0,
      typeof data.vpnDetails === 'object' ? JSON.stringify(data.vpnDetails) : data.vpnDetails,
      data.isIncognito ? 1 : 0,
      data.isAutomated ? 1 : 0,
      data.status || 'VERIFIED'
    );

    return result.lastInsertRowid;
  },

  // Find candidate matches across all historical verifications
  findPotentialAlts(currentDiscordId, fpData) {
    // 1. Direct device UUID / cookie match (100% confidence)
    // 2. Exact combined hardware fingerprint match (98% confidence)
    // 3. Canvas + Audio + WebGL renderer match (95% confidence)
    // 4. IP match (80% confidence, or higher when combined with same screen/timezone)

    const matches = [];
    const seenAltIds = new Set();

    // Check 1: Device UUID (Stored in IndexedDB / persistent cookie)
    if (fpData.deviceUuid) {
      const stmt = db.prepare(`
        SELECT DISTINCT v.discord_id, u.username, u.avatar, u.account_created_at, v.created_at as last_seen, 'DEVICE_COOKIE' as vector, 100 as confidence
        FROM verifications v
        LEFT JOIN users u ON v.discord_id = u.discord_id
        WHERE v.device_uuid = ? AND v.discord_id != ?
      `);
      const rows = stmt.all(fpData.deviceUuid, currentDiscordId);
      for (const row of rows) {
        if (!seenAltIds.has(row.discord_id)) {
          matches.push(row);
          seenAltIds.add(row.discord_id);
        }
      }
    }

    // Check 2: Combined Fingerprint (Hardware hash)
    if (fpData.combinedFingerprint) {
      const stmt = db.prepare(`
        SELECT DISTINCT v.discord_id, u.username, u.avatar, u.account_created_at, v.created_at as last_seen, 'HARDWARE_FINGERPRINT' as vector, 98 as confidence
        FROM verifications v
        LEFT JOIN users u ON v.discord_id = u.discord_id
        WHERE v.combined_fingerprint = ? AND v.discord_id != ?
      `);
      const rows = stmt.all(fpData.combinedFingerprint, currentDiscordId);
      for (const row of rows) {
        if (!seenAltIds.has(row.discord_id)) {
          matches.push(row);
          seenAltIds.add(row.discord_id);
        }
      }
    }

    // Check 3: Canvas + WebGL + Audio hash combo
    if (fpData.canvasHash && fpData.audioHash && fpData.webglRenderer) {
      const stmt = db.prepare(`
        SELECT DISTINCT v.discord_id, u.username, u.avatar, u.account_created_at, v.created_at as last_seen, 'CANVAS_GPU_AUDIO' as vector, 95 as confidence
        FROM verifications v
        LEFT JOIN users u ON v.discord_id = u.discord_id
        WHERE v.canvas_hash = ? AND v.audio_hash = ? AND v.webgl_renderer = ? AND v.discord_id != ?
      `);
      const rows = stmt.all(fpData.canvasHash, fpData.audioHash, fpData.webglRenderer, currentDiscordId);
      for (const row of rows) {
        if (!seenAltIds.has(row.discord_id)) {
          matches.push(row);
          seenAltIds.add(row.discord_id);
        }
      }
    }

    // Check 4: Same IP match (especially relevant for gambling multi-accounting)
    if (fpData.ip) {
      const stmt = db.prepare(`
        SELECT DISTINCT v.discord_id, u.username, u.avatar, u.account_created_at, v.created_at as last_seen, 'IP_ADDRESS' as vector, 85 as confidence
        FROM verifications v
        LEFT JOIN users u ON v.discord_id = u.discord_id
        WHERE v.ip = ? AND v.discord_id != ?
      `);
      const rows = stmt.all(fpData.ip, currentDiscordId);
      for (const row of rows) {
        if (!seenAltIds.has(row.discord_id)) {
          matches.push(row);
          seenAltIds.add(row.discord_id);
        }
      }
    }

    return matches;
  },

  // Record an alt link relationship
  recordAltLink(id1, id2, vector, confidence) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO alt_links (discord_id_1, discord_id_2, match_vector, confidence)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id1, id2, vector, confidence);
    stmt.run(id2, id1, vector, confidence);
  },

  // Get full cluster of all connected alts for a given user
  getAllConnectedAlts(discordId) {
    // Traverse the alt graph to find all associated accounts
    const visited = new Set();
    const queue = [discordId];
    const alts = [];

    const stmt = db.prepare(`
      SELECT a.discord_id_2 as alt_id, a.match_vector, a.confidence, a.detected_at,
             u.username, u.avatar, u.account_created_at, u.is_whitelisted, u.is_blacklisted
      FROM alt_links a
      LEFT JOIN users u ON a.discord_id_2 = u.discord_id
      WHERE a.discord_id_1 = ?
    `);

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const links = stmt.all(current);
      for (const link of links) {
        if (!visited.has(link.alt_id)) {
          if (link.alt_id !== discordId) {
            alts.push(link);
          }
          queue.push(link.alt_id);
        }
      }
    }

    return alts;
  },

  // User Lookup Information
  getUserLookupData(discordId) {
    const user = this.getUser(discordId);
    const verificationsStmt = db.prepare('SELECT * FROM verifications WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10');
    const verifications = verificationsStmt.all(discordId);
    const alts = this.getAllConnectedAlts(discordId);

    return {
      user,
      verifications,
      alts
    };
  },

  // Sessions
  createSession(token, discordId, guildId, ttlSeconds = 600) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO verification_sessions (token, discord_id, guild_id, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(token, discordId, guildId, expiresAt);
  },

  getSession(token) {
    const stmt = db.prepare('SELECT * FROM verification_sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP');
    return stmt.get(token);
  },

  consumeSession(token) {
    const session = this.getSession(token);
    if (session) {
      db.prepare('DELETE FROM verification_sessions WHERE token = ?').run(token);
    }
    return session;
  },

  // Overall Statistics
  getStats(guildId) {
    const totalVerifStmt = guildId
      ? db.prepare("SELECT COUNT(*) as count FROM verifications WHERE guild_id = ? AND status = 'VERIFIED'")
      : db.prepare("SELECT COUNT(*) as count FROM verifications WHERE status = 'VERIFIED'");

    const blockedAltsStmt = guildId
      ? db.prepare("SELECT COUNT(*) as count FROM verifications WHERE guild_id = ? AND status = 'ALT_REJECTED'")
      : db.prepare("SELECT COUNT(*) as count FROM verifications WHERE status = 'ALT_REJECTED'");

    const blockedVpnStmt = guildId
      ? db.prepare("SELECT COUNT(*) as count FROM verifications WHERE guild_id = ? AND status = 'VPN_REJECTED'")
      : db.prepare("SELECT COUNT(*) as count FROM verifications WHERE status = 'VPN_REJECTED'");

    const totalAltsStmt = db.prepare('SELECT COUNT(DISTINCT discord_id_1) as count FROM alt_links');

    return {
      totalVerified: (guildId ? totalVerifStmt.get(guildId) : totalVerifStmt.get()).count,
      blockedAlts: (guildId ? blockedAltsStmt.get(guildId) : blockedAltsStmt.get()).count,
      blockedVpns: (guildId ? blockedVpnStmt.get(guildId) : blockedVpnStmt.get()).count,
      flaggedAltRings: totalAltsStmt.get().count
    };
  }
};
