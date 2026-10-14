const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Permanently blacklist a member from verifying with RV VERIFY')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The member to blacklist or un-blacklist')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('status')
        .setDescription('True to blacklist, False to un-blacklist')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for blacklist (e.g. bonus abuse / raid)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const status = interaction.options.getBoolean('status');
    const reason = interaction.options.getString('reason') || 'Blacklisted by Admin';

    database.setUserBlacklist(targetUser.id, status, reason);

    const embed = new EmbedBuilder()
      .setTitle('⛔ RV VERIFY | Blacklist Updated')
      .setColor(status ? 0xFF0000 : 0x00FF88)
      .setDescription(
        status
          ? `🚫 <@${targetUser.id}> (\`${targetUser.username}\`) has been **permanently blacklisted**.\nTheir verification attempts will be automatically denied.`
          : `✅ <@${targetUser.id}> (\`${targetUser.username}\`) has been **removed from the blacklist**.`
      )
      .addFields({ name: 'Reason', value: `\`${reason}\`` })
      .setFooter({ text: 'RV VERIFY Security Controls' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
