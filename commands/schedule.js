module.exports = {
	name: 'schedule',
	description: 'Informs user of strimmer\'s schedule',
	execute(msg) {
		msg.channel.send(
`Strimmer will try his best to stick to his schedule, but might not always make it!

\`Mon-Fri: 8pm-11pm EST
Sat-Sun: No set schedule, but may randomly stream\`

Streams generally last at least 3 hours, but will sometimes last longer. It all depends on what mood strimmer is in and how quality the games are.`
		);
	}
};
