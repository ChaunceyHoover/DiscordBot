module.exports = {
	name: 'notify',
	description: 'An opt in/out for streaming notifications.',
	execute(msg) {
		if (!msg.guild.available) return new Error("Guild not available.");
		var role = msg.guild.roles.find("name", "Notified Memers");

		if (msg.member.roles.has(role.id)) {
			msg.member.removeRole(role);
			msg.reply("Successfully opted out of stream notifications");
		} else {
			msg.member.addRole(role);
			msg.reply("Successfully opted in for stream notifications");
		}
	}
};
