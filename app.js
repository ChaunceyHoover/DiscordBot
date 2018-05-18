const fs = require('fs');
const Discord = require('discord.js');
const { prefix, token } = require('./config.json');

const client = new Discord.Client();
client.commands = new Discord.Collection();

// Load in commands dynamically
const commandFiles = fs.readdirSync('./commands');

for (const file of commandFiles) {
	const cmd = require(`./commands/${file}`);
	client.commands.set(cmd.name, cmd);
}

// Bot events
client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}.`);
});

client.on('message', msg => {
	if (!msg.content.startsWith(prefix) || msg.author.bot) return;

	const args = msg.content.slice(prefix.length).split(/ +/);
	const cmd = args.shift().toLowerCase();

	if (cmd === "commands" || cmd === "cmds") {
		var cmds = client.commands.values();
		var bot_reply = "\n";
		for (var command of cmds) {
			bot_reply += "`" + prefix + command.name + "` - " + command.description + "\n";
		}
		msg.reply(bot_reply);
		return;
	}

	if (!client.commands.has(cmd)) return;

	try {
		client.commands.get(cmd).execute(msg, args);
	} catch(err) {
		console.error(err);
		msg.reply('OOPSIE WOOPSIE!! Uwu We made a fucky wucky!! A wittle fucko boingo! The code monkeys at our headquarters are working VEWY HAWD to fix this!');
		msg.reply('(there was an error trying to run this command. I\'m sorry. Memer made me say that.)');
	}
});

client.login(token);
