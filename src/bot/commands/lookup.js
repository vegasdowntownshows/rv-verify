const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const database = require('../../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up a member to view all connected alts, hardware fingerprints, and risk history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The member to inspect')
        .setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const lookupData = database.getUserLookupData(targetUser.id);
    const userRecord = lookupData.user;
    const verifications = lookupData.verifications || [];
    const alts = lookupData.alts || [];

    const latestVerif = verifications[0] || null;

    // Vector name translation
    const vectorNames = {
      'DEVICE_COOKIE': 'Persistent Device Cookie (Exact Profile Match)',
      'HARDWARE_FINGERPRINT': 'Hardware Fingerprint Match',
      'CANVAS_GPU_AUDIO': 'Canvas / GPU / AudioContext Tri-Vector Match',
      'IP_ADDRESS': 'Network IP Match'
    };

    let altsText = '`No linked alts detected (Clean)`';
    if (alts.length > 0) {
      altsText = alts.map((a, i) => {
        const vName = vectorNames[a.match_vector] || a.match_vector;
        return `**${i + 1}.** <@${a.alt_id}> (\`${a.alt_id}\`)\n   ↳ Vector: \`${vName}\` (${a.confidence}% match)`;
      }).join('\n\n');
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 RV VERIFY | Member Dossier: ${targetUser.username}`)
      .setColor(alts.length > 0 ? 0xFF3366 : 0x00FF88)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '👤 Identity Info',
          value: `**Tag:** <@${targetUser.id}>\n**ID:** \`${targetUser.id}\`\n**Account Created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
          inline: true
        },
        {
          name: '🛡️ Security Status',
          value: `**Whitelisted:** ${userRecord?.is_whitelisted ? '`Yes (Bypass)`' : '`No`'}\n**Blacklisted:** ${userRecord?.is_blacklisted ? '`Yes (Banned)`' : '`No`'}\n**Verification Count:** \`${verifications.length}\``,
          inline: true
        },
        {
          name: `🔗 Linked Alt Accounts (${alts.length})`,
          value: altsText.slice(0, 1024),
          inline: false
        }
      );

    if (latestVerif) {
      embed.addFields(
        {
          name: '💻 Last Known Device & Network',
          value: `**IP:** \`${latestVerif.ip || 'Unknown'}\`\n**VPN/Proxy:** ${latestVerif.is_vpn ? '`⚠️ DETECTED`' : '`Clean Residential`'}\n**GPU:** \`${latestVerif.webgl_renderer || 'Unknown'}\`\n**Screen:** \`${latestVerif.screen_res || 'Unknown'}\` | **Cores:** \`${latestVerif.cpu_cores || '?'}\` | **RAM:** \`${latestVerif.ram_gb || '?'}GB\`\n**Last Verified:** <t:${Math.floor(new Date(latestVerif.created_at).getTime() / 1000)}:R>`,
          inline: false
        }
      );
    }

    embed.setFooter({ text: 'RV VERIFY Alt Detection Intelligence' }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
