module.exports = {
	name: 'ping',
	description: 'Simple ping command to make sure bot is functioning.',
	execute(msg) {
		msg.channel.send('Pong.');
	}
};
