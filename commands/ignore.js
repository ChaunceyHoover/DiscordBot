// Helper module for anything database-related
const dbHelper = require('../lib/database-helper');

let { prefix } = require('../config.json');

const CHANNEL_REGEX = /<#(\d+)>/;

module.exports = {
	name: 'ignore',
	description: 'Manages channels the bot will ignore commands from',
	permission: 0, // Permission level
	execute(msg, args) {
        const command = prefix + module.exports.name;
        
		switch(args[0]) {
            case 'channels':
            case 'list':
                dbHelper.getIgnoreChannels(msg.guild.id)
                    .then(channels => {
                        if (channels.length > 0) {
                            let reply = "Commands executed in the following channels are ignored:\n";
                            channels.forEach(function(channel) { reply += `<#${channel}>, `});
                            reply = reply.substr(0, reply.length - 2);
                            msg.channel.send(reply);
                        } else {
                            msg.channel.send("Currently, the bot isn't ignoring any channels.");
                        }
                    })
                    .catch(err => { throw err; });
                break;
            case 'add':
                let properAddUsage = `Proper usage: \`${command} add <channel>\``;
                if (args.length == 2) {
                    let result = CHANNEL_REGEX.exec(args[1]);
                    if (result) {
                        let channelId = result[1];
                        dbHelper.addIgnoreChannel(msg.guild.id, channelId)
                            .then(status => {
                                if (status == 0)
                                    msg.channel.send(`Successfully added <#${channelId}> to ignored channels.`)
                                else if (status == 1)
                                    msg.channel.send(`Channel <#${channelId}> is already being ignored.`);
                                else
                                    throw `Unexpected return code returned from \`${command} add <#${channelId}>\``;
                            })
                            .catch(err => { throw err; });
                    } else {
                        msg.reply(`Invalid argument. Please specify a channel.\n${properAddUsage}`);
                    }
                } else {
                    msg.reply(`Invalid arguments given. ${properAddUsage}`);
                }
                break;
            case 'del':
            case 'delete':
            case 'rem':
            case 'remove':
                break;
            case 'help':
                break;
            default:
                msg.channel.send(`Invalid argument. Please try \`${command} help\` for help.`);
                break;
        }
	}
};
