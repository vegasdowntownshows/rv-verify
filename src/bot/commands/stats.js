const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View RV VERIFY protection statistics for this server'),

  async execute(interaction) {
    const stats = database.getStats(interaction.guildId);

    const embed = new EmbedBuilder()
      .setTitle('📊 RV VERIFY | Server Protection Statistics')
      .setColor(0x00F0FF)
      .setDescription('Overview of anti-alt and bot-farming defenses active on this server:')
      .addFields(
        {
          name: '✅ Verified Members',
          value: `\`${stats.totalVerified.toLocaleString()}\``,
          inline: true
        },
        {
          name: '🚫 Alts Blocked',
          value: `\`${stats.blockedAlts.toLocaleString()}\``,
          inline: true
        },
        {
          name: '🌐 VPNs / Proxies Blocked',
          value: `\`${stats.blockedVpns.toLocaleString()}\``,
          inline: true
        },
        {
          name: '🕸️ Total Alt Rings Tracked',
          value: `\`${stats.flaggedAltRings.toLocaleString()}\``,
          inline: true
        }
      )
      .setFooter({ text: 'RV VERIFY • The Ultimate Double Counter & Vaultcord Alternative' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
