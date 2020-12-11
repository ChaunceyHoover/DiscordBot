module.exports = {
	name: 'ping',
	description: 'Simple ping command to make sure bot is functioning.',
	permission: 0,
	execute(msg) {
		let now = new Date();
		msg.channel.send(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
	}
};
