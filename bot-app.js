require('dotenv').config()

// Discord.js imports
const fs = require('fs');
const Discord = require('discord.js');

// Helper module to move all database-based code in a separate file
let dbHelper = require('./lib/database-helper');

// Config stuff
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
	dbHelper.init(client).catch(console.error);
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

		dbHelper.getThresholds(msg.guild.id)
			.then(thresholds => {
				if (_total >= thresholds[0].Count) {
					dbHelper.punishUser(msg).catch(console.error);
				}
			})
			.catch(console.error);
    }
});

// Checks every `interval` seconds to see if anyone needs freed
setInterval(function() {
	dbHelper.releaseUsers(client).catch(console.error);
}, interval * 1000);

// Starts the bot
client.login(process.env.TOKEN);