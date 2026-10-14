const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure RV VERIFY roles and logging channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('verified_role')
        .setDescription('Role to grant upon successful verification')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('log_channel')
        .setDescription('Channel where alt alerts and verification logs will be sent')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('unverified_role')
        .setDescription('Optional unverified role to remove upon verification')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('strict_alt_block')
        .setDescription('Automatically block verification if an alt is detected (Default: True)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('block_vpn')
        .setDescription('Automatically reject connections from VPNs or proxies (Default: True)')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('min_account_age')
        .setDescription('Minimum Discord account age required in days (Default: 3)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const verifiedRole = interaction.options.getRole('verified_role');
    const logChannel = interaction.options.getChannel('log_channel');
    const unverifiedRole = interaction.options.getRole('unverified_role');
    const strictAltBlock = interaction.options.getBoolean('strict_alt_block') ?? true;
    const blockVpn = interaction.options.getBoolean('block_vpn') ?? true;
    const minAccountAge = interaction.options.getInteger('min_account_age') ?? 3;

    database.setGuildSettings(interaction.guildId, {
      verifiedRoleId: verifiedRole.id,
      unverifiedRoleId: unverifiedRole ? unverifiedRole.id : null,
      logChannelId: logChannel.id,
      strictAltBlock,
      blockVpn,
      minAccountAgeDays: minAccountAge
    });

    const embed = new EmbedBuilder()
      .setTitle('🛡️ RV VERIFY | Configuration Saved')
      .setColor(0x00FF88)
      .setDescription('Server verification rules and security channels have been updated.')
      .addFields(
        { name: '✅ Verified Role', value: `<@&${verifiedRole.id}>`, inline: true },
        { name: '⏳ Unverified Role', value: unverifiedRole ? `<@&${unverifiedRole.id}>` : '`None`', inline: true },
        { name: '📜 Alt Logs Channel', value: `<#${logChannel.id}>`, inline: true },
        { name: '🚫 Strict Alt Blocking', value: strictAltBlock ? '`Enabled (Auto-Block)`' : '`Alerts Only`', inline: true },
        { name: '🌐 Block VPNs/Proxies', value: blockVpn ? '`Enabled`' : '`Disabled`', inline: true },
        { name: '👶 Min Account Age', value: `\`${minAccountAge} days\``, inline: true }
      )
      .setFooter({ text: 'RV VERIFY Anti-Alt Security Gate' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
