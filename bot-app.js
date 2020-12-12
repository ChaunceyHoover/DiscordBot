require('dotenv').config()

// Discord.js imports
const fs = require('fs');
const Discord = require('discord.js');

// Database
const mariadb = require('mariadb');
const connectionString = process.env.JAWSDB_MARIA_URL;
const sqlRegex = /mysql:\/\/(\w+):(\w+)@(.*):(\d+)\/(\w+)/g;
const result = sqlRegex.exec(connectionString);
const pool = mariadb.createPool({
    user: result[1], password: result[2],
    host: result[3], port: Number.parseInt(result[4]), 
    database: result[5],
    connectionLimit: 2
});

if (!fs.existsSync('./config.json'))
	fs.copyFileSync('./config.json.tmpl', './config.json');

let { interval, prefix } = require('./config.json');

// Create discord.js objects
const client = new Discord.Client();
client.commands = new Discord.Collection(); // store commands instead of writing if statement for each command

// Load in commands dynamically
const commandFiles = fs.readdirSync('./commands');

// Adds each command in the `./commands` folder to the bot
for (const file of commandFiles) {
	if (file.toLowerCase().endsWith('.js')) {
		const cmd = require(`./commands/${file}`);
		client.commands.set(cmd.name, cmd);
	}
}

// Basically the 'onStart' method - this runs when it successfully connects to discord and initiates itself
client.on('ready', () => {
	pool.getConnection()
		.then(conn => {
			conn.query('SELECT UserId, GuildId FROM Horny')
				// bot can't manage messages sent before it started, so only choice is to free people
				.then(rows => {
					if (rows.length > 0) {
						rows.forEach(function(row) {
							let guild = client.guilds.cache.get(row.GuildId);
							if (guild) {
								guild.members.fetch({user: row.UserId, force: true})
									.then(function(member) {
										/** TEMPORARY HARD CODING */
										let horny;
										if (guild.id == "551632336899407901") {
											horny = guild.roles.cache.get("555103123811598338");
										} else {
											horny = guild.roles.cache.get("786808425237577729");
										}
										member.roles.remove(horny);
									});
							}
						});
					}
				})
				.then(_ => conn.query('DELETE FROM Horny WHERE Id > 0'))
				.then(_ => conn.release())
				.catch(err => {
					console.error(`[START] ${err}`);
					conn.release();
				});
		});
	console.log(`Logged in as ${client.user.tag}.`);
});

// onMessage - Runs every time someone sends a message
// quick reference `msg`: https://discord.js.org/#/docs/main/stable/class/Message
client.on('message', msg => {
	if (!msg.content.startsWith(prefix) || msg.author.bot) return; // if message doesn't start with command prefix or is from bot, ignore

	// Split command into an array (ex: "!ping hello world" => ['!ping', 'hello', 'world'])
	const args = msg.content.slice(prefix.length).split(/ +/);
	const cmd = args.shift().toLowerCase();

	// The only built in command - !cmds / !commands. Lists all registered commands w/ a description
	if (cmd === "commands" || cmd === "cmds") {
		var cmds = client.commands.values();
		var bot_reply = "\n";
		for (var command of cmds) {
			bot_reply += "`" + prefix + command.name + "` - " + command.description + "\n";
		}
		msg.reply(bot_reply);
		return;
	}

	// Ignores if they try to run a command bot doesn't have
	if (!client.commands.has(cmd)) return;

	// Command was found, so run it and report any errors.
	try {
		client.commands.get(cmd).execute(msg, args);
	} catch(err) {
		console.error(err);
		msg.reply('There was an error trying to run this command. Please repeatedly spam the mods until they notice it. Thank you.');
		msg.channel.send(`\`\`\`\n${err}\`\`\``);
	}
});

client.on('messageReactionAdd', (reaction, user) => {
	let msg = reaction.message, emoji = reaction.emoji;

	let horny;

	/** TEMPORARY HARD CODING */
	if (msg.guild.id == "551632336899407901") {
		horny = msg.guild.roles.cache.get("555103123811598338");
	} else {
		horny = msg.guild.roles.cache.get("786808425237577729");
	}

	if (emoji.name == '🔞') {
		/**
		 * FINAL VERSION:
		 * 1. Check minimum number of votes set in database
		 * 2. Check if `_total` is greater than or equal to that number
		 * 3. If so, give user special role and insert user into table
		 * 4. Every <15s/30s/45s/60s>, bot will check if there are any entries in table.
		 *    4.1. If there are, bot will check if (current_time() - time_inserted) >= jail_time()
		 *         (where jail_time() = total number of minutes at current reaction count)
		 */
		let _total = msg.reactions.cache.get('🔞').count;
		if (_total >= 1) { // TEMPORARILY HARD CODED
            pool.getConnection()
                .then(conn => {
					let _member = msg.member;
                    conn.query(`SELECT UserId, Time FROM Horny WHERE UserId = ?`, [_member.id])
                        .then(rows => {
                            if (rows.length == 0) {
								conn.query(
									"INSERT INTO Horny (UserId, MessageId, ChannelId, GuildId) VALUES (?, ?, ?, ?)",
									[_member.id, msg.id, msg.channel.id, msg.guild.id]);
								_member.roles.add(horny);
							}
                        })
                        .then(_ => conn.release())
                        .catch(err => {
							conn.release();
							console.error(`[JAIL] ${err}`);
                        });
                }).catch(dbErr => {
                    console.error(`[DB] ${dbErr}`);
                });
        }
	}
});

// Checks every `interval` seconds to see if anyone needs freed
setInterval(function() {
	pool.getConnection()
		.then(conn => {
			conn.query("SELECT Id, UserId, MessageId, ChannelId, GuildId, Time FROM Horny")
				.then(rows => {
					if (rows.length > 0)
						rows.forEach(function(row) {
							let _guild = client.guilds.cache.get(row.GuildId);
							if (_guild) {
								let _channel = _guild.channels.cache.get(row.ChannelId);
								if (_channel) {
									let _msg = _channel.messages.cache.get(row.MessageId);
									if (_msg) {
										let total = _msg.reactions.cache.get('🔞').count;
										let minutes = (new Date() - row.Time) / 1000 / 60;
										let sentenceTime = 15;
										if (total >= 3)
											sentenceTime = 5;
										else if (total >= 4)
											sentenceTime = 15;
										else if (total >= 5)
											sentenceTime = 30;
										else
											sentenceTime = 60;

										if (minutes > sentenceTime) {
											/** TEMPORARY HARD CODING */
											let horny;
											if (_guild.id == "551632336899407901") {
												horny = _guild.roles.cache.get("555103123811598338");
											} else {
												horny = _guild.roles.cache.get("786808425237577729");
											}

											_guild.members.cache.get(row.UserId).roles.remove(horny);
											conn.query("DELETE FROM Horny WHERE Id = ?", [row.Id]);
										}
									}
								}
							}
						});
				})
				.then(_res => {
					conn.release();
				})
				.catch(err => {
					conn.release();
					console.error(`[LOOP] ${err}`);
				});
		})
}, interval * 1000);

// Starts the bot
client.login(process.env.TOKEN);