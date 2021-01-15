require('dotenv').config()

// Discord.js imports
const fs = require('fs');
const Discord = require('discord.js');

// Helper module for anything database-related
const dbHelper = require('./database-helper');

let { interval, prefix } = require('../config.json');
const { createPool } = require('mariadb');
const version = JSON.parse(require('fs').readFileSync('package.json')).version;

// Create discord.js objects
const client = new Discord.Client();
client.commands = new Discord.Collection(); // store commands instead of writing if statement for each command

// Load in commands dynamically
const commandFiles = fs.readdirSync('./commands');

// Adds each command in the `./commands` folder to the bot
for (const file of commandFiles) {
	if (file.toLowerCase().endsWith('.js')) {
		const cmd = require(`../commands/${file}`);
		client.commands.set(cmd.name, cmd);
	}
}

let currentVotes = [];

// Basically the 'onStart' method - this runs when it successfully connects to discord and initiates itself
client.on('ready', () => {
	dbHelper.init(client).catch(console.error);
	client.user.setPresence({ activity: { name: 'you be horny in main', type: 'WATCHING' }, status: 'idle' })
		.catch(console.error);
	console.log(`Logged in as ${client.user.tag} running v${version}`);
});

// onMessage - Runs every time someone sends a message
client.on('message', msg => {
	if (!msg.content.startsWith(prefix) || msg.author.bot) return; // if message doesn't start with command prefix or is from bot, ignore

	dbHelper.getIgnoreChannels(msg.guild.id)
		.then(channels => {
			if (channels.length == 0 || !channels.includes(msg.channel.id)) {
				// Ignore commands send in ignored channels
				if (channels.includes(msg.channel.id)) return;

				// Split command into an array (ex: "!ping hello world" => ['!ping', 'hello', 'world'])
				const args = msg.content.slice(prefix.length).split(/ +/);
				const cmd = args.shift().toLowerCase();

				// The only built in command - !cmds / !commands. Lists all registered commands w/ a description
				if (cmd === "commands" || cmd === "cmds") {
					var cmds = client.commands.values();
					var bot_reply = "\n";
					for (var command of cmds) {
						bot_reply += "`" + prefix + command.name + "`\n" + command.description + "\n\n";
					}
					msg.channel.send(bot_reply);
					return;
				}

				// Ignores if they try to run a command bot doesn't have
				if (!client.commands.has(cmd)) return;

				// Command was found, so run it and report any errors.
				try {
					client.commands.get(cmd).execute(msg, args);
				} catch(err) {
					console.error(`[MAIN] ${err}`);
					msg.reply('There was an error trying to run this command. Please repeatedly spam the mods until they notice it. Thank you.');
					msg.channel.send(`\`\`\`\n${err}\`\`\``);
				}
			}
		})
		.catch(err => {
			console.error(err);
			msg.reply('There was an error trying to run this command. Please repeatedly spam the mods until they notice it. Thank you.');
			msg.channel.send(`\`\`\`\n${err}\`\`\``);
		});
});

client.on('messageReactionAdd', (reaction, user) => {
	let msg = reaction.message, emoji = reaction.emoji;

	dbHelper.getIgnoreChannels(msg.guild.id)
		.then(channels => {
			if (channels.length == 0 || !channels.includes(msg.channel.id)) {
				if (emoji.name == '🔞' && msg.author.id != client.user.id && !currentVotes.includes(msg.id)) {
					currentVotes.push(msg.id);
					dbHelper.hasBeenVoted(msg)
						.then((result) => {
							if (result.Voted) {
								let score = result.Yay - result.Nay;
								let outcome = 'a tied result';
								if (score > 0)
									outcome = 'they were punished';
								else if (score < 0)
									outcome = 'they were not punished';

								let ESTtime = result.Time.setHours(result.Time.getHours() - 5);
								msg.channel.send(`<@!${user.id}>, This message has already been voted on at ${ESTtime.toLocaleDateString() 
									+ ' ' + ESTtime.toLocaleTimeString()} EST.\n\nThe result from voting was **${outcome}**.`);
							} else {
								msg.react('✅')
									.then(() => msg.react('❌'))
									.then(() => {
										let name = msg.member.nickname || msg.member.user.username;
										msg.channel.send(`Voting process started. Decide ${name}'s fate now.`)
											.then(sentMsg => {
												msg.awaitReactions((reaction, _user) => (reaction.emoji.name == '✅' || reaction.emoji.name == '❌'),
												{ max: msg.guild.memberCount * 2, time: 45 * 1000 }).then(collected => {
													let nay = collected.get('❌') ? collected.get('❌').count - 1 : 0;
													let yay = collected.get('✅') ? collected.get('✅').count - 1 : 0;
													
													dbHelper.registerMessageVoted(msg, yay, nay)
														.then(() => {
																dbHelper.getPunishRole(msg.guild.id)
																	.then(roleId => {
																		if (yay - nay > 0) {
																			sentMsg.edit(`Voting done! ${name} is guilty! Two minutes of jail!`);
																			msg.member.roles.add(roleId);
																			setTimeout(function() { msg.member.roles.remove(roleId); }, 1000 * 60 * 2);
																		} else {
																			let punishedMember = msg.guild.members.cache.get(user.id);
																			let punishedName = punishedMember.nickname || punishedMember.user.username;
																			sentMsg.edit(`Voting done! ${name} is not guilty! ${punishedName} shall instead be punished with two minutes of jail for starting the vote in the first place!`);
																			punishedMember.roles.add(roleId);
																			setTimeout(function() { punishedMember.roles.remove(roleId); }, 1000 * 60 * 2);
																		}
																		if (msg.reactions.cache.get('🔞'))
																			msg.reactions.cache.get('🔞').remove();
																		if (msg.reactions.cache.get('✅'))
																			msg.reactions.cache.get('✅').remove();
																		if (msg.reactions.cache.get('❌'))
																			msg.reactions.cache.get('❌').remove();

																			
																		let index = currentVotes.indexOf(msg.id);
																		if (index >= 0) {
																			currentVotes.splice(index, 1);
																		}
																	})
																	.catch(err => {
																		console.error(err);
																		msg.channel.send('Unable to remove reactions to end voting process. Democracy has been lost. You are forever doomed. Abandon all hope now.\n'
																			+ `\`\`\`\n${err}\`\`\``);
																		return;
																	});
														})	
														.catch(err => {
															console.error(err);
															msg.channel.send('Unable to add reactions to start voting process. Democracy has been lost. You are forever doomed. Abandon all hope now.\n'
																+ `\`\`\`\n${err}\`\`\``);
															return;
														});
												});
											});
									})
									.catch(err => {
										console.error(err);
										msg.channel.send('Unable to add reactions to start voting process. Democracy has been lost. You are forever doomed. Abandon all hope now.\n'
											+ `\`\`\`\n${err}\`\`\``);
										return;
									});
							}
						})
						.catch(err => {
							console.error(err);
							msg.reply('There was an error trying to react to this message. Please repeatedly spam the mods until they notice it. Thank you.');
							msg.channel.send(`\`\`\`\n${err}\`\`\``);
						});
				}
			}
		})
		.catch(err => {
			console.error(err);
			msg.reply('There was an error trying to react to this message. Please repeatedly spam the mods until they notice it. Thank you.');
			msg.channel.send(`\`\`\`\n${err}\`\`\``);
		});
});

// Starts the bot
client.login(process.env.TOKEN);