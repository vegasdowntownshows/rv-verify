const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sendverify')
    .setDescription('Post the RV VERIFY verification prompt and button in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send verification prompt (defaults to current channel)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    // Check if guild is configured
    const settings = database.getGuildSettings(interaction.guildId);
    if (!settings || !settings.verified_role_id) {
      return interaction.reply({
        content: '⚠️ Please run `/setup` first to configure your Verified Role before posting the verification gate.',
        ephemeral: true
      });
    }

    // Save verify channel
    database.setGuildSettings(interaction.guildId, {
      verifyChannelId: channel.id
    });

    const embed = new EmbedBuilder()
      .setTitle('🛡️ RV VERIFY | Verification Gate')
      .setColor(0x00F0FF)
      .setDescription(
        `Welcome to **${interaction.guild.name}**!\n\n` +
        `To protect our community and maintain fair play for all members, you must complete a fast device verification before gaining server access.\n\n` +
        `**Verification Rules:**\n` +
        `• 🚫 **Strict No Alting:** Any alternate or duplicate accounts will be automatically detected, flagged, and linked to your profile.\n` +
        `• 🔒 **No VPNs / Proxies:** Please disable active VPN connections before verifying.\n` +
        `• ⚡ **Instant Access:** Once verified, you will immediately receive server roles.\n\n` +
        `Click the **Verify with RV VERIFY** button below to begin.`
      )
      .setThumbnail(interaction.guild.iconURL() || null)
      .setFooter({ text: 'Powered by RV VERIFY • High-Integrity Anti-Alt Protection' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rv_start_verify')
        .setLabel('Verify with RV VERIFY')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🛡️')
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Verification embed posted in <#${channel.id}>!`, ephemeral: true });
  }
};
