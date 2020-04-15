const fs = require('fs');
const Discord = require('discord.js');
const { prefix, token } = require('./config.json');

const client = new Discord.Client();
client.commands = new Discord.Collection();

// Load in commands dynamically
const commandFiles = fs.readdirSync('./commands');

for (const file of commandFiles) {
	if (file !== "cmd.tmpl.js") {
		const cmd = require(`./commands/${file}`);
		client.commands.set(cmd.name, cmd);
	}
}

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
		msg.reply('There was an error trying to run this command. Please repeatedly spam the mods until they notice it. Thank you.')
	}
});

client.login(token);
