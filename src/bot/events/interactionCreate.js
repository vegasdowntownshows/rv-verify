const crypto = require('crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const database = require('../../services/database');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[Command Error] /${interaction.commandName}:`, err);
        const replyPayload = {
          content: '❌ There was an error while executing this command.',
          ephemeral: true
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload);
        } else {
          await interaction.reply(replyPayload);
        }
      }
      return;
    }

    // 2. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // --- Verify Button Clicked ---
      if (customId === 'rv_start_verify') {
        // Check if user is already verified
        const settings = database.getGuildSettings(interaction.guildId);
        if (settings && settings.verified_role_id && interaction.member.roles.cache.has(settings.verified_role_id)) {
          return interaction.reply({
            content: '✅ You are already verified in this server!',
            ephemeral: true
          });
        }

        // Generate one-time secure session token
        const sessionToken = crypto.randomBytes(24).toString('hex');
        database.createSession(sessionToken, interaction.user.id, interaction.guildId, 900); // 15 mins

        const verifyUrl = `${config.server.baseUrl}/verify?token=${sessionToken}`;

        const embed = new EmbedBuilder()
          .setTitle('🛡️ RV VERIFY | Verification Portal')
          .setColor(0x00F0FF)
          .setDescription(
            `Hello <@${interaction.user.id}>,\n\n` +
            `Click the button below to open your personalized verification session in your browser.\n\n` +
            `⚠️ **Anti-Alt Warning:**\n` +
            `• Do not use VPNs or datacenter proxies.\n` +
            `• Alternate accounts and bot farms will be permanently flagged.\n` +
            `• This link is unique to you and will expire in 15 minutes.`
          )
          .setFooter({ text: 'RV VERIFY • Secure Anti-Alt Gate' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Complete Verification')
            .setStyle(ButtonStyle.Link)
            .setURL(verifyUrl)
            .setEmoji('🔗')
        );

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }

      // --- Admin Quick Action: Ban Suspect & All Linked Alts ---
      if (customId.startsWith('rv_ban_all_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ content: '⛔ You do not have permission to ban members.', ephemeral: true });
        }

        const suspectId = customId.replace('rv_ban_all_', '');
        await interaction.deferReply({ ephemeral: true });

        const alts = database.getAllConnectedAlts(suspectId);
        const allIdsToBan = [suspectId, ...alts.map(a => a.alt_id)];
        const bannedList = [];

        for (const id of allIdsToBan) {
          try {
            await interaction.guild.members.ban(id, {
              reason: `RV VERIFY: Banned for multi-accounting / alting ring (Linked to ${suspectId})`
            });
            bannedList.push(id);
          } catch (e) {
            // Member might not be in guild or already banned
          }
        }

        return interaction.editReply({
          content: `🔨 **Banned ${bannedList.length} linked account(s)** from this server:\n${bannedList.map(id => `• <@${id}> (\`${id}\`)`).join('\n')}`
        });
      }

      // --- Admin Quick Action: Kick Suspect Account ---
      if (customId.startsWith('rv_kick_suspect_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ content: '⛔ You do not have permission to kick members.', ephemeral: true });
        }

        const suspectId = customId.replace('rv_kick_suspect_', '');
        try {
          const member = await interaction.guild.members.fetch(suspectId).catch(() => null);
          if (member) {
            await member.kick('RV VERIFY: Kicked for alt account detection');
            return interaction.reply({ content: `👢 Successfully kicked <@${suspectId}> (\`${suspectId}\`).`, ephemeral: true });
          } else {
            return interaction.reply({ content: `⚠️ Member <@${suspectId}> is no longer in the server.`, ephemeral: true });
          }
        } catch (e) {
          return interaction.reply({ content: `❌ Failed to kick member: ${e.message}`, ephemeral: true });
        }
      }

      // --- Admin Quick Action: Whitelist Account (Shared PC) ---
      if (customId.startsWith('rv_whitelist_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '⛔ You do not have permission to whitelist members.', ephemeral: true });
        }

        const suspectId = customId.replace('rv_whitelist_', '');
        database.setUserWhitelist(suspectId, true, `Approved by ${interaction.user.tag} (Shared PC)`);

        // Give verified role
        const settings = database.getGuildSettings(interaction.guildId);
        if (settings && settings.verified_role_id) {
          const member = await interaction.guild.members.fetch(suspectId).catch(() => null);
          if (member) {
            await member.roles.add(settings.verified_role_id).catch(() => {});
            if (settings.unverified_role_id) {
              await member.roles.remove(settings.unverified_role_id).catch(() => {});
            }
          }
        }

        return interaction.reply({
          content: `✅ <@${suspectId}> has been **whitelisted** and assigned the verified role.`,
          ephemeral: true
        });
      }
    }
  }
};
