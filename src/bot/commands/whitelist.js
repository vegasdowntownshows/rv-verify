const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Whitelist or un-whitelist a member (bypass alt checks for shared computers)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The member to whitelist or un-whitelist')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('status')
        .setDescription('True to whitelist, False to remove from whitelist')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for whitelisting (e.g. shared family computer)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const status = interaction.options.getBoolean('status');
    const reason = interaction.options.getString('reason') || 'Admin approval';

    database.setUserWhitelist(targetUser.id, status, reason);

    const embed = new EmbedBuilder()
      .setTitle('🛡️ RV VERIFY | Whitelist Updated')
      .setColor(status ? 0x00FF88 : 0xFFA500)
      .setDescription(
        status
          ? `✅ <@${targetUser.id}> (\`${targetUser.username}\`) has been **whitelisted**.\nThey will bypass alt detection and VPN checks.`
          : `⚠️ <@${targetUser.id}> (\`${targetUser.username}\`) has been **removed from the whitelist**.\nNormal verification and alt rules now apply.`
      )
      .addFields({ name: 'Reason', value: `\`${reason}\`` })
      .setFooter({ text: 'RV VERIFY Security Controls' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
