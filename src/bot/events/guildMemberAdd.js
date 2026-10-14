const database = require('../../services/database');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const settings = database.getGuildSettings(member.guild.id);
      if (!settings) return;

      // Automatically assign Unverified role if set
      if (settings.unverified_role_id) {
        await member.roles.add(settings.unverified_role_id).catch(err => {
          console.warn(`[Member Join] Could not assign unverified role to ${member.user.tag}:`, err.message);
        });
      }
    } catch (err) {
      console.error('[guildMemberAdd Error]', err);
    }
  }
};
