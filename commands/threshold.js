// Helper module for anything database-related
const dbHelper = require('../lib/database-helper');

let { prefix } = require('../config.json');

module.exports = {
	name: 'threshold',
	description: `Manages the server reaction thresholds for punishing users. \`${prefix}${module.exports.name} help\` for more info.`,
	permission: 1,
	execute(msg, args) {
		// Convert all arguments to lowercase
		args.forEach(function(arg, index) { args[index] = arg.toLowerCase() });
		const command = prefix + module.exports.name;
		const properUsage = `Proper usage: \`${command} add <count> <time>\``;

		switch(args[0]) {
			case 'add':
			case 'set':
				if (args.length == 3) {
					let count = Number.parseInt(args[1]);
					let time = Number.parseInt(args[2]);

					if (isNaN(count) || isNaN(time)) {
						msg.reply(`Invalid arguments given. ${properUsage}.`);
						return;
					}

					if (count <= 0) {
						msg.reply('Invalid reaction amount. Please use a number bigger than 0.');
					} else if (time <= 0) {
						msg.reply('Invalid amount of minutes. Please use a number bigger than 0.');
					} else {
						dbHelper.setThreshold(msg.guild.id, new dbHelper.Threshold(count, time))
							.then(result => msg.channel.send(`Successfully ${result == 0 ? 'added' : 'updated'} the punishment for ${count} reaction${count > 1 ? 's' : ''} to ${time} minute${time > 1 ? 's' : ''}`))
							.catch(err => { throw err });
					}
				} else {
					msg.reply(`Invalid number of arguments. ${properUsage}.`);
				}
				break;
			case 'del':
			case 'delete':
			case 'remove':
			case 'rem':
				let properUsage = `Proper usage: \`${command} del <count>\``;
				if (args.length == 2) {
					let count = Number.parseInt(args[1]);
					if (isNaN(count)) {
						msg.reply(`Invalid arguments given. ${properUsage}.`);
						return;
					}

					if (count <= 0) {
						msg.reply('Invalid reaction amount. Please use a number bigger than 0.');
					} else {
						dbHelper.removeThreshold(msg.guild.id, count)
							.then(result => {
								if (result == 0) {
									msg.channel.send(
										`Successfully removed reaction threshold for ${count} reaction${count > 1 ? 's' : ''}`);
								} else if (result == 1) {
									msg.channel.send('No thresholds exist for this server. Please set some before trying to remove them.');
								} else {
									msg.channel.send('Well there wasn\'t an error but this situation wasn\'t covered sooooooo');
								}
							})
							.catch(err => { throw err });
					}
				} else {
					msg.reply(`Invalid number of arguments. ${properUsage}.`);
				}
				break;
			case 'web':
			case 'site':
			case 'website':
				msg.channel.send('Not yet implemented. Try again later :slight_smile:');
				break;
			case 'help':
				msg.channel.send(
`\`${command} help\`
Shows this command.

\`${command} <set/add> <count> <time>\`
Adds a new reaction threshold of 'count' reactions for 'time' minutes.
\`\`\`
usage: ${command} set 3 15
  Creates a threshold for 3 reactions = 15 minute punishment. If a threshold for 3 reactions already exists, it is replaced with 15 minutes.\`\`\`
\`${command} <del/delete/rem/remove> <count>\`
Removes the reaction threshold for count reactions.
\`\`\`
usage: ${command} del 3
  Removes whatever threshold for 3 reactions is, if one exists.\`\`\`
\`${command} <site/web/website>\`
Sends the URL for manging thresholds from a web interface.`);
				break;
			default:
				msg.channel.send(`Invalid argument. Please try \`${command} help\` for help.`)
		}
	}
};