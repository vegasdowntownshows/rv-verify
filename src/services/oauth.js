const config = require('../config');

class OAuthService {
  /**
   * Generates the Discord OAuth2 authorization URL
   */
  static getAuthUrl(stateToken) {
    const redirectUri = encodeURIComponent(`${config.server.baseUrl}/auth/callback`);
    const scopes = encodeURIComponent('identify');
    return `https://discord.com/oauth2/authorize?client_id=${config.bot.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopes}&state=${stateToken}&prompt=none`;
  }

  /**
   * Exchanges authorization code for an OAuth2 access token
   */
  static async exchangeCode(code) {
    const redirectUri = `${config.server.baseUrl}/auth/callback`;
    const body = new URLSearchParams({
      client_id: config.bot.clientId,
      client_secret: config.bot.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to exchange OAuth code: ${response.status} ${errText}`);
    }

    return await response.json();
  }

  /**
   * Fetches Discord user profile using access token
   */
  static async fetchUser(accessToken) {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch Discord user: ${response.status} ${errText}`);
    }

    const user = await response.json();

    // Calculate exact account creation timestamp from snowflake
    const snowflake = BigInt(user.id);
    const discordEpoch = 1420070400000n;
    const createdAtMs = Number((snowflake >> 22n) + discordEpoch);
    const createdAt = new Date(createdAtMs);
    const ageDays = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);

    return {
      ...user,
      createdAt,
      ageDays
    };
  }
}

module.exports = OAuthService;
