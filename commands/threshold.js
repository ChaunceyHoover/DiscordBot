// Helper module for anything database-related
const dbHelper = require('../lib/database-helper');

let { prefix } = require('../config.json');

module.exports = {
	name: 'threshold',
	description: `Manages the server reaction thresholds for punishing users. \`${prefix}threshold help\` for more info.`,
	permission: 1,
	execute(msg, args) {
        // Convert all arguments to lowercase
        args.forEach(function(arg, index) { args[index] = arg.toLowerCase() });

        switch(args[0]) {
            case 'add':
            case 'set':
                msg.channel.send('Add / set');
                break;
            case 'del':
            case 'delete':
            case 'remove':
            case 'rem':
                msg.channel.send('Delete / remove');
                break;
            case 'help':
                msg.channel.send(
`\`${prefix}threshold help\`
Shows this command.

\`${prefix}threshold <set/add> <count> <time>\`
Adds a new reaction threshold of 'count' reactions for 'time' minutes.
\`\`\`
usage: ${prefix}threshold set 3 15
  Creates a threshold for 3 reactions = 15 minute punishment. If a threshold for 3 reactions already exists, it is replaced with 15 minutes.\`\`\`
\`${prefix}threshold <del/delete/rem/remove> <count>\`
Removes the reaction threshold for count reactions.
\`\`\`
usage: ${prefix}threshold del 3
  Removes whatever threshold for 3 reactions is, if one exists.\`\`\`
\`${prefix}threshold <site/web/website>\`
Sends the URL for manging thresholds from a web interface.`);
                break;
            default:
                msg.channel.send(`Invalid argument. Please try \`${prefix}threshold help\` for help.`)
        }
	}
};