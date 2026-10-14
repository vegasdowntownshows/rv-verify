const config = require('./config');
const { createDiscordClient } = require('./bot/client');
const { createWebServer } = require('./web/server');
const { db } = require('./services/database');

async function main() {
  console.log('====================================================');
  console.log('       🛡️  RV VERIFY - HIGH-SECURITY INTEGRITY GATE  ');
  console.log('====================================================');

  // 1. Initialize Discord Bot Client
  const client = createDiscordClient();

  // 2. Initialize Express Web Server
  const app = createWebServer(client);
  const server = app.listen(config.server.port, () => {
    console.log(`[Web Portal] Server listening on port ${config.server.port}`);
    console.log(`[Web Portal] Verification Gate URL: ${config.server.baseUrl}/verify`);
  });

  // 3. Connect Discord Bot
  if (!config.bot.token || config.bot.token === 'your_bot_token_here') {
    console.warn('\n⚠️ [RV VERIFY Warning] DISCORD_BOT_TOKEN is not configured in .env!');
    console.warn('   Please copy .env.example to .env and insert your bot credentials.');
    console.warn('   The Web Verification Portal is currently running in standalone test mode.\n');
  } else {
    try {
      await client.login(config.bot.token);
    } catch (err) {
      console.error('[RV VERIFY] Bot login failed:', err.message);
    }
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[RV VERIFY] Shutting down cleanly...');
    server.close();
    client.destroy();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[RV VERIFY Fatal Error]', err);
  process.exit(1);
});
