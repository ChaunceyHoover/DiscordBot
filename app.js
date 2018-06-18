const fs = require('fs');
const Discord = require('discord.js');
const { prefix, token, owner, notify } = require('./config.json');

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

// Automatic live detection

client.on('presenceUpdate', (oldMember, newMember) => {
	// Verify check is for owner
	if (newMember.user.id == owner) {
		var op = oldMember.presence,
			np = newMember.presence;

		// Get channel to send streaming notification(s) to
		var textChannels = newMember.client.channels.find('name', 'Text Channels')
		if (textChannels == null) {
			console.log("Error trying to notify users; could not find text channels");
			return;
		}
		var notifyChannel = textChannels.guild.channels.find('name', notify.channel);
		if (notifyChannel == null) {
			console.log("Error finding notification channel '" + notify.channel + "'");
			return;
		}
		var notifyRole = notifyChannel.guild.roles.find('name', notify.role);
		if (notifyRole == null) {
			console.log("Error finding notification role '" + notify.role + "'. Using `@here` instead.");
		}

		// Check if stream starting
		if ((op.game == null || op.game.type !== 1) && np.game != null && np.game.type === 1)
			if (notifyRole == null)
				notifyChannel.send("@here Going live! " +
					(notify.nicknames[Math.floor(Math.random() * notify.nicknames.length)]) +
					" just started streaming.\nJoin him here: https://twitch.tv/SadFrogMemer");
			else
				notifyChannel.send(notifyRole.toString() + " Going live! " +
					(notify.nicknames[Math.floor(Math.random() * notify.nicknames.length)]) +
					" just started streaming.\nJoin him here: https://twitch.tv/SadFrogMemer");
		else if (op.game != null && op.game.type === 1 && (np.game == null || np.game.type !== 1))
			notifyChannel.send("Stream finished! " + (notify.nicknames[Math.floor(Math.random() * notify.nicknames.length)]) + " just finished yet another successful stream! Thank you to everyone who came out.");
	}
});

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
