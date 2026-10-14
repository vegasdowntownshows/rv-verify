const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db } = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alts')
    .setDescription('View the latest alt account detection events and flagged accounts')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of records to show (default: 5, max: 15)')
        .setMinValue(1)
        .setMaxValue(15)
        .setRequired(false)
    ),

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') || 5;

    const stmt = db.prepare(`
      SELECT a.discord_id_1, a.discord_id_2, a.match_vector, a.confidence, a.detected_at,
             u1.username as u1_name, u2.username as u2_name
      FROM alt_links a
      LEFT JOIN users u1 ON a.discord_id_1 = u1.discord_id
      LEFT JOIN users u2 ON a.discord_id_2 = u2.discord_id
      ORDER BY a.detected_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit);

    if (rows.length === 0) {
      return interaction.reply({
        content: '✨ No alt accounts detected yet. The server is currently clean!',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🚨 RV VERIFY | Recent Alt Account Incidents')
      .setColor(0xFF3366)
      .setDescription(`Displaying the most recent **${rows.length}** alt link detections:`)
      .setFooter({ text: 'RV VERIFY Alt Monitoring Engine' })
      .setTimestamp();

    rows.forEach((row, i) => {
      const time = `<t:${Math.floor(new Date(row.detected_at).getTime() / 1000)}:R>`;
      embed.addFields({
        name: `#${i + 1} Detection (${row.confidence}% Confidence) • ${time}`,
        value: `👤 **Suspect:** <@${row.discord_id_1}> (\`${row.u1_name || row.discord_id_1}\`)\n` +
               `🔗 **Linked Alt:** <@${row.discord_id_2}> (\`${row.u2_name || row.discord_id_2}\`)\n` +
               `🎯 **Trigger:** \`${row.match_vector}\``,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
