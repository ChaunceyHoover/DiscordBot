// TODO: Move this to bot status in the future

module.exports = {
	name: 'version',
	description: 'Command to get bot version.',
	permission: 0,
	execute(msg) {
		let package = JSON.parse(require('fs').readFileSync('package.json')).version
		msg.channel.send(`Running version ${package}`);
	}
};
