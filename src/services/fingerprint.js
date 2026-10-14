const crypto = require('crypto');

class FingerprintService {
  /**
   * Generates a SHA-256 hash of a string
   */
  static hash(str) {
    if (!str) return null;
    return crypto.createHash('sha256').update(String(str)).digest('hex');
  }

  /**
   * Normalizes and computes the combined hardware fingerprint
   */
  static generateCombinedFingerprint(payload) {
    const components = [
      payload.canvasHash || '',
      payload.audioHash || '',
      payload.webglRenderer || '',
      payload.webglVendor || '',
      payload.screenRes || '',
      payload.cpuCores || '',
      payload.ramGb || '',
      payload.timezone || '',
      payload.platform || ''
    ];

    return this.hash(components.join('|'));
  }

  /**
   * Evaluates incoming client telemetry for bot/automation traces
   */
  static detectAutomation(clientData, userAgent) {
    const flags = [];

    if (clientData.webdriver === true) {
      flags.push('webdriver_active');
    }

    if (userAgent && (
      userAgent.includes('HeadlessChrome') ||
      userAgent.includes('PhantomJS') ||
      userAgent.includes('Electron') ||
      userAgent.includes('Puppeteer') ||
      userAgent.includes('Playwright')
    )) {
      flags.push('headless_user_agent');
    }

    if (clientData.hasCdcProps) {
      flags.push('cdp_automation_detected');
    }

    if (clientData.pluginCount === 0 && !clientData.isMobile) {
      flags.push('zero_browser_plugins');
    }

    if (clientData.languagesCount === 0) {
      flags.push('missing_browser_languages');
    }

    return {
      isAutomated: flags.length > 0,
      flags
    };
  }

  /**
   * Evaluates incognito/private browsing mode indicators
   */
  static detectIncognito(clientData) {
    // Quota < 120MB on desktop Chrome usually signifies incognito mode
    const isIncognitoQuota = clientData.storageQuota && clientData.storageQuota < 120 * 1024 * 1024;
    return clientData.isIncognito === true || isIncognitoQuota;
  }

  /**
   * Computes a risk score based on alt matches, account age, VPN, and automation
   */
  static calculateRiskScore(params) {
    let score = 0;
    const reasons = [];

    // Alts found
    if (params.altMatches && params.altMatches.length > 0) {
      const topConfidence = Math.max(...params.altMatches.map(m => m.confidence || 0));
      score += topConfidence;
      reasons.push(`${params.altMatches.length} linked alt account(s) detected (Confidence: ${topConfidence}%)`);
    }

    // VPN / Proxy
    if (params.isVpn) {
      score += 35;
      reasons.push('Proxy / Datacenter VPN detected');
    }

    // Fresh account (e.g., < 3 days old)
    if (params.accountAgeDays !== null && params.accountAgeDays < params.minAgeDays) {
      score += 30;
      reasons.push(`Account age (${params.accountAgeDays.toFixed(1)} days) is below minimum (${params.minAgeDays} days)`);
    }

    // Automation / Bot Farm
    if (params.isAutomated) {
      score += 50;
      reasons.push('Headless browser / bot automation traces identified');
    }

    // Incognito
    if (params.isIncognito) {
      score += 15;
      reasons.push('Private / Incognito browsing session');
    }

    return {
      riskScore: Math.min(100, score),
      isHighRisk: score >= 60,
      reasons
    };
  }
}

module.exports = FingerprintService;
