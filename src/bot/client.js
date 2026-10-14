const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function createDiscordClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages
    ]
  });

  client.commands = new Collection();

  // Load Command Files
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  const commandsData = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commandsData.push(command.data.toJSON());
    } else {
      console.warn(`[Client] Command at ${filePath} is missing required data or execute properties.`);
    }
  }

  // Load Event Files
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  // Ready Event
  client.once('ready', async () => {
    console.log(`[RV VERIFY] Bot connected as ${client.user.tag} (ID: ${client.user.id})`);

    // Set bot presence
    client.user.setPresence({
      activities: [{ name: 'Anti-Alt & Server Integrity Gate', type: ActivityType.Watching }],
      status: 'online'
    });

    // Register Slash Commands
    if (config.bot.token && config.bot.clientId) {
      const rest = new REST({ version: '10' }).setToken(config.bot.token);
      try {
        console.log(`[RV VERIFY] Refreshing ${commandsData.length} global application (/) commands...`);
        await rest.put(
          Routes.applicationCommands(config.bot.clientId),
          { body: commandsData }
        );
        console.log('[RV VERIFY] Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error('[RV VERIFY] Failed to register application commands:', error);
      }
    }
  });

  return client;
}

module.exports = { createDiscordClient };
