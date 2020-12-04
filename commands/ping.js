module.exports = {
	name: 'ping',
	description: 'Simple ping command to make sure bot is functioning.',
	permission: 0,
	execute(msg) {
		msg.channel.send(':underage:');
	}
};
