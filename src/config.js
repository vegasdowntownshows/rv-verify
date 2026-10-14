require('dotenv').config();

module.exports = {
  bot: {
    token: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    name: 'RV VERIFY'
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET || 'rv-verify-super-secure-secret-key-change-me',
    cookieSecret: process.env.COOKIE_SECRET || 'rv-verify-cookie-secret-change-me'
  },
  security: {
    // Minimum Discord account age in days (default 3 days for gambling servers to stop fresh raid alts)
    minAccountAgeDays: parseInt(process.env.MIN_ACCOUNT_AGE_DAYS || '3', 10),
    // Block suspected VPN/Proxies automatically
    blockVpn: process.env.BLOCK_VPN === 'true',
    // Strict mode: if an alt is detected, automatically deny verification
    strictAltBlock: process.env.STRICT_ALT_BLOCK !== 'false',
    // ProxyCheck.io API key (optional, enhances VPN detection)
    proxyCheckKey: process.env.PROXYCHECK_KEY || ''
  },
  database: {
    path: process.env.DB_PATH || './rv_verify.sqlite'
  }
};
