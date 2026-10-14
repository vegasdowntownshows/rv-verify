const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const database = require('../services/database');
const FingerprintService = require('../services/fingerprint');
const VpnDetector = require('../services/vpnDetector');
const OAuthService = require('../services/oauth');

function createWebServer(discordClient) {
  const app = express();

  // Middleware
  app.set('trust proxy', true);
  app.use(cors());
  app.use(cookieParser(config.server.cookieSecret));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Rate limiter for verification API
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: { error: 'Too many verification attempts. Please wait a moment.' }
  });

  // Health check endpoint for 24/7 keep-alive monitors
  app.get('/health', (req, res) => {
    res.json({ status: 'online', name: 'RV VERIFY', uptime: process.uptime() });
  });

  app.get('/api/ping', (req, res) => {
    res.send('PONG');
  });

  // In-memory cache for OAuth authenticated users during their session (stateToken -> user)
  const authSessionMap = new Map();

  // 1. Serve Verification Page
  app.get('/verify', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // 2. Initiate Discord OAuth2 Flow
  app.get('/auth/discord', (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.status(400).send('Missing session token.');
    }
    const authUrl = OAuthService.getAuthUrl(token);
    res.redirect(authUrl);
  });

  // 3. Discord OAuth2 Callback
  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state token.');
    }

    try {
      const tokenData = await OAuthService.exchangeCode(code);
      const user = await OAuthService.fetchUser(tokenData.access_token);

      // Store authenticated user in memory linked to session token
      authSessionMap.set(state, {
        user,
        timestamp: Date.now()
      });

      // Save user record in database
      database.upsertUser(user.id, {
        username: `${user.username}#${user.discriminator || '0'}`,
        avatar: user.avatar,
        accountCreatedAt: user.createdAt.toISOString()
      });

      // Redirect back to verification gate
      res.redirect(`/verify?token=${encodeURIComponent(state)}`);
    } catch (err) {
      console.error('[OAuth Callback Error]', err);
      res.status(500).send(`Discord Authentication Failed: ${err.message}`);
    }
  });

  // 4. Check Session Info Endpoint
  app.get('/api/session-info', (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.json({ authenticated: false });
    }

    const sessionData = authSessionMap.get(token);
    if (!sessionData) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: {
        id: sessionData.user.id,
        username: `${sessionData.user.username}#${sessionData.user.discriminator || '0'}`,
        avatar: sessionData.user.avatar,
        ageDays: sessionData.user.ageDays
      }
    });
  });

  // 5. Submit Verification & Run Deep Alt Detection Engine
  app.post('/api/verify-submit', apiLimiter, async (req, res) => {
    try {
      const { sessionToken, ...telemetry } = req.body;
      if (!sessionToken) {
        return res.status(400).json({ status: 'ERROR', error: 'Missing session token.' });
      }

      const sessionData = authSessionMap.get(sessionToken);
      if (!sessionData) {
        return res.status(400).json({ status: 'ERROR', error: 'Session expired or invalid. Please re-verify from Discord.' });
      }

      // Check DB session for target guild
      const dbSession = database.getSession(sessionToken);
      const guildId = dbSession ? dbSession.guild_id : null;
      const targetGuild = guildId ? discordClient.guilds.cache.get(guildId) : null;
      const guildSettings = guildId ? database.getGuildSettings(guildId) : null;

      const user = sessionData.user;
      const userDb = database.getUser(user.id);

      // Extract client IP (handle reverse proxies / Cloudflare headers)
      let clientIp = req.headers['cf-connecting-ip'] ||
                     req.headers['x-forwarded-for'] ||
                     req.socket.remoteAddress ||
                     '';
      if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
      }
      if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
      }

      // Check Whitelist (bypass alt checks for approved users)
      if (userDb && userDb.is_whitelisted) {
        await grantDiscordRole(targetGuild, user.id, guildSettings);
        database.recordVerification({
          discordId: user.id,
          guildId,
          ip: clientIp,
          deviceUuid: telemetry.deviceUuid,
          canvasHash: telemetry.canvasHash,
          webglRenderer: telemetry.webglRenderer,
          webglVendor: telemetry.webglVendor,
          audioHash: telemetry.audioHash,
          screenRes: telemetry.screenRes,
          cpuCores: telemetry.cpuCores,
          ramGb: telemetry.ramGb,
          timezone: telemetry.timezone,
          userAgent: req.headers['user-agent'],
          combinedFingerprint: FingerprintService.generateCombinedFingerprint(telemetry),
          isVpn: false,
          vpnDetails: 'Whitelisted User',
          isIncognito: telemetry.isIncognito,
          isAutomated: false,
          status: 'VERIFIED'
        });

        return res.json({ status: 'VERIFIED', message: 'Account is whitelisted.' });
      }

      // Check Blacklist
      if (userDb && userDb.is_blacklisted) {
        return res.json({ status: 'BLACKLISTED', error: 'Your Discord account is permanently blacklisted from this server.' });
      }

      // 1. Account Age Check
      const minAge = guildSettings?.min_account_age_days ?? config.security.minAccountAgeDays;
      if (user.ageDays < minAge) {
        database.recordVerification({
          discordId: user.id,
          guildId,
          ip: clientIp,
          deviceUuid: telemetry.deviceUuid,
          canvasHash: telemetry.canvasHash,
          webglRenderer: telemetry.webglRenderer,
          webglVendor: telemetry.webglVendor,
          audioHash: telemetry.audioHash,
          screenRes: telemetry.screenRes,
          cpuCores: telemetry.cpuCores,
          ramGb: telemetry.ramGb,
          timezone: telemetry.timezone,
          userAgent: req.headers['user-agent'],
          combinedFingerprint: FingerprintService.generateCombinedFingerprint(telemetry),
          status: 'AGE_REJECTED'
        });

        return res.json({
          status: 'AGE_REJECTED',
          minDays: minAge,
          currentDays: Math.floor(user.ageDays)
        });
      }

      // 2. VPN & Proxy Inspection
      const vpnResult = await VpnDetector.checkIp(clientIp);
      const shouldBlockVpn = guildSettings?.block_vpn !== undefined
        ? Boolean(guildSettings.block_vpn)
        : config.security.blockVpn;

      if (vpnResult.isVpn && shouldBlockVpn) {
        database.recordVerification({
          discordId: user.id,
          guildId,
          ip: clientIp,
          deviceUuid: telemetry.deviceUuid,
          canvasHash: telemetry.canvasHash,
          webglRenderer: telemetry.webglRenderer,
          webglVendor: telemetry.webglVendor,
          audioHash: telemetry.audioHash,
          screenRes: telemetry.screenRes,
          cpuCores: telemetry.cpuCores,
          ramGb: telemetry.ramGb,
          timezone: telemetry.timezone,
          userAgent: req.headers['user-agent'],
          combinedFingerprint: FingerprintService.generateCombinedFingerprint(telemetry),
          isVpn: true,
          vpnDetails: vpnResult,
          status: 'VPN_REJECTED'
        });

        return res.json({
          status: 'VPN_REJECTED',
          provider: vpnResult.provider
        });
      }

      // 3. Compute Fingerprint & Alt Detection
      const combinedFingerprint = FingerprintService.generateCombinedFingerprint(telemetry);
      const automationCheck = FingerprintService.detectAutomation(telemetry, req.headers['user-agent']);

      const fpData = {
        deviceUuid: telemetry.deviceUuid,
        combinedFingerprint,
        canvasHash: telemetry.canvasHash,
        webglRenderer: telemetry.webglRenderer,
        audioHash: telemetry.audioHash,
        ip: clientIp
      };

      // Search DB for existing linked accounts
      const potentialAlts = database.findPotentialAlts(user.id, fpData);

      let isAlt = false;
      let topConfidence = 0;
      let topVector = '';

      if (potentialAlts.length > 0) {
        isAlt = true;
        for (const alt of potentialAlts) {
          database.recordAltLink(user.id, alt.discord_id, alt.vector, alt.confidence);
          if (alt.confidence > topConfidence) {
            topConfidence = alt.confidence;
            topVector = alt.vector;
          }
        }
      }

      // Fetch all connected alts in the network graph for this alter
      const allLinkedAlts = isAlt ? database.getAllConnectedAlts(user.id) : [];

      // Record this verification attempt
      const statusToRecord = isAlt ? 'ALT_REJECTED' : 'VERIFIED';
      database.recordVerification({
        discordId: user.id,
        guildId,
        ip: clientIp,
        deviceUuid: telemetry.deviceUuid,
        canvasHash: telemetry.canvasHash,
        webglRenderer: telemetry.webglRenderer,
        webglVendor: telemetry.webglVendor,
        audioHash: telemetry.audioHash,
        screenRes: telemetry.screenRes,
        cpuCores: telemetry.cpuCores,
        ramGb: telemetry.ramGb,
        timezone: telemetry.timezone,
        userAgent: req.headers['user-agent'],
        combinedFingerprint,
        isVpn: vpnResult.isVpn,
        vpnDetails: vpnResult,
        isIncognito: telemetry.isIncognito,
        isAutomated: automationCheck.isAutomated,
        status: statusToRecord
      });

      // 4. Handle Alt Detection Alert & Blocking
      if (isAlt) {
        // Send High-Priority Admin Alert Embed to Discord
        await sendAltNotificationToAdmins({
          discordClient,
          guildId,
          guildSettings,
          suspectUser: user,
          clientIp,
          vpnResult,
          matchVector: topVector,
          confidence: topConfidence,
          allLinkedAlts,
          telemetry
        });

        const shouldBlockAlt = guildSettings?.strict_alt_block !== undefined
          ? Boolean(guildSettings.strict_alt_block)
          : config.security.strictAltBlock;

        if (shouldBlockAlt) {
          return res.json({
            status: 'ALT_REJECTED',
            matchVector: topVector,
            confidence: topConfidence
          });
        }
      }

      // 5. Verification Succeeded: Grant Discord Verified Role
      const roleAssigned = await grantDiscordRole(targetGuild, user.id, guildSettings);

      // Clean up session token
      authSessionMap.delete(sessionToken);
      database.consumeSession(sessionToken);

      res.json({
        status: 'VERIFIED',
        roleAssigned,
        message: 'Successfully verified.'
      });
    } catch (err) {
      console.error('[Verification Submission Error]', err);
      res.status(500).json({ status: 'ERROR', error: 'Internal verification processing failure.' });
    }
  });

  return app;
}

// Assigns Verified Role and removes Unverified Role
async function grantDiscordRole(guild, userId, guildSettings) {
  if (!guild || !guildSettings) return false;

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    if (guildSettings.verified_role_id) {
      await member.roles.add(guildSettings.verified_role_id);
    }
    if (guildSettings.unverified_role_id) {
      await member.roles.remove(guildSettings.unverified_role_id).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error(`[Role Assignment Error] Could not give role to ${userId}:`, err.message);
    return false;
  }
}

// Rich Admin Alert Notification
async function sendAltNotificationToAdmins({
  discordClient,
  guildId,
  guildSettings,
  suspectUser,
  clientIp,
  vpnResult,
  matchVector,
  confidence,
  allLinkedAlts,
  telemetry
}) {
  if (!guildId || !guildSettings || !guildSettings.log_channel_id) return;

  try {
    const channel = await discordClient.channels.fetch(guildSettings.log_channel_id).catch(() => null);
    if (!channel) return;

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    // Human-friendly vector name
    const vectorNames = {
      'DEVICE_COOKIE': 'Persistent Device Token (Same Physical Browser Profile)',
      'HARDWARE_FINGERPRINT': 'Exact Hardware Fingerprint Match (GPU + CPU + Screen)',
      'CANVAS_GPU_AUDIO': 'Canvas / WebGL / AudioContext Tri-Vector Match',
      'IP_ADDRESS': 'Exact Network IP Address Match'
    };

    const vectorDesc = vectorNames[matchVector] || matchVector;

    // Build list of all linked alts
    let linkedListText = '';
    if (allLinkedAlts.length === 0) {
      linkedListText = '`None currently recorded`';
    } else {
      linkedListText = allLinkedAlts.map((alt, idx) => {
        const username = alt.username || 'Unknown';
        const dateStr = alt.detected_at ? new Date(alt.detected_at).toLocaleDateString() : 'Recent';
        return `**${idx + 1}.** <@${alt.alt_id}> (\`${alt.alt_id}\`)\n   ↳ Match: \`${alt.match_vector}\` (${alt.confidence}% confidence) | Detected: ${dateStr}`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('🚨 RV VERIFY | ALT ACCOUNT DETECTED')
      .setColor(0xFF3366)
      .setDescription(`An alt account attempt was detected and intercepted by **RV VERIFY**.`)
      .setThumbnail(
        suspectUser.avatar
          ? `https://cdn.discordapp.com/avatars/${suspectUser.id}/${suspectUser.avatar}.png`
          : 'https://cdn.discordapp.com/embed/avatars/0.png'
      )
      .addFields(
        {
          name: '👤 Suspect Account',
          value: `**Tag:** <@${suspectUser.id}> (\`${suspectUser.username}\`)\n**ID:** \`${suspectUser.id}\`\n**Account Age:** \`${Math.floor(suspectUser.ageDays)} days old\``,
          inline: true
        },
        {
          name: '🎯 Detection Integrity',
          value: `**Match Vector:** \`${vectorDesc}\`\n**Confidence:** \`${confidence}%\`\n**Action:** \`Verification Blocked\``,
          inline: true
        },
        {
          name: '🌐 Network & Device',
          value: `**IP:** \`${clientIp}\`\n**VPN / Proxy:** \`${vpnResult.isVpn ? 'DETECTED (' + vpnResult.provider + ')' : 'Clean / Residential'}\`\n**GPU:** \`${telemetry.webglRenderer || 'Unknown'}\``,
          inline: false
        },
        {
          name: `🔗 All Linked Discord Accounts (${allLinkedAlts.length})`,
          value: linkedListText.slice(0, 1024),
          inline: false
        }
      )
      .setFooter({ text: 'RV VERIFY Anti-Alt Security Gate • Gambling Protection' })
      .setTimestamp();

    // Quick Admin Action Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rv_ban_all_${suspectUser.id}`)
        .setLabel('Ban Suspect & Alts')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔨'),
      new ButtonBuilder()
        .setCustomId(`rv_kick_suspect_${suspectUser.id}`)
        .setLabel('Kick Suspect')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👢'),
      new ButtonBuilder()
        .setCustomId(`rv_whitelist_${suspectUser.id}`)
        .setLabel('Whitelist (Shared PC)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[Admin Notification Error]', err);
  }
}

module.exports = { createWebServer, sendAltNotificationToAdmins };
