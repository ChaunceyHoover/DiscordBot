require('dotenv').config()

// Mariadb stuff
const mariadb = require('mariadb');
const connectionString = process.env.JAWSDB_MARIA_URL;
const sqlRegex = /mysql:\/\/(\w+):(\w+)@(.*):(\d+)\/(\w+)/; // connection string format: mysql://<user>:<pass>@<domain.tld>:<port>/<default-schema>
const result = sqlRegex.exec(connectionString);
const pool = mariadb.createPool({
	user: result[1], password: result[2],
	host: result[3], port: Number.parseInt(result[4]), 
	database: result[5],
	connectionLimit: 5
});

/**
 * A struct for storing the minimum number of reactions (`Count`) to warrant
 * some number of minutes (`Time`) as a punishment.
 */
class Threshold {
	/**
	 * @param {Int} count The amount of reactions required
	 * @param {Int} time The amount of minutes to be punished for the amount of reactions
	 */
	constructor(count=0, time=0) {
		this.Count = count;
		this.Time = time;
	}
}

const helper = {
	/**
	 * Does all first-time startup code relating to the database. As of now,
	 * it just frees everyone that was being punished.
	 * @param {Discord.Client} client The bot client, used to initialize the bot and sign in
	 * @returns {Promise} - reject message contains error, resolve is empty
	 */
	init: function(client) {
		return new Promise((resolve, reject) => {
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
											.then(member => {
												helper.getPunishRole(row.GuildId)
													.then(roleId => member.roles.remove(roleId))
													.catch(err => { console.error(`[INIT1] ${err}`); reject(err) })
											})
											.catch(err => { console.error(`[INIT2] ${err}`); reject(err) });
									}
								});
							}
						})
						.then(_ => conn.query('DELETE FROM Horny WHERE Id > 0'))
						.then(_ => conn.release())
						.catch(err => {
							console.error(`[INIT3] ${err}`);
							conn.release();
							reject(err);
						});
				})
				.then(resolve)
				.catch(err => { console.error(`[INIT4] ${err}`); reject(err); });
		});
	},

	/**
	 * Gets all the saved thresholds for reactions from the database. This is how
	 * x reactions = y minutes of punishment is determined.
	 * @param {Snowflake} serverId Discord Snowflake (String) for the server / guild
	 * @returns {Promise} - resolve contains array of {Threshold}s organized from smallest `Count` to `Largest`, reject contains error
	 * @see {Threshold}
	 */
	getThresholds: function(serverId) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query("SELECT Value FROM Config WHERE Property = 'ReactionThreshold' AND Server = ?", [serverId])
						.then(rows => {
							// Filter out the additional data given to us from mariadb
							let filteredRows = [];

							// Threshold format stored in database as `x:y` where x (int) = number of reactions needed,
							// y (int) = number of minutes to punish for `x` total (or more if no value in database higher than x) reactions
							const regex = /(\d+):(\d+)/;
							for (let i = 0; i < rows.length; i++) {
								let result = regex.exec(rows[i].Value);
								filteredRows.push(new Threshold(Number.parseInt(result[1]), Number.parseInt(result[2])));
							}

							// Sort by number of reactions needed
							filteredRows.sort(function(x, y) {
								if (x.Count < y.Count)
									return -1;
								else if (x.Count > y.Count)
									return 1;
								return 0;
							});
							resolve(filteredRows);
						})
						.then(_ => conn.release())
						.catch(err => { console.error(`[GT1] ${err}`); conn.release() });
				})
				.catch(err => { console.error(`[GT2] ${err}`); reject(err) })
		});
	},

	/**
	 * Gets the Discord Snowflake (String) for the ID of the Role that is used to punish people with too many
	 * reactions on a message
	 * @param {Snowflake} serverId Discord Snowflake (String) for the server / guild
	 * @returns {Promise} - resolve contains ID of role, reject contains error
	 */
	getPunishRole: function(serverId) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query("SELECT Value FROM Config WHERE Property = 'PunishRoleId' AND Server = ?", [serverId])
						.then(rows => {
							// Ideally, there should never be more than 1, so I'm not going to bother handling the rest
							if (rows.length >= 1) {
								resolve(rows[0].Value);
							} else {
								reject();
							}
						})
						.then(_ => conn.release())
						.catch(err => console.error(`[GPR1] ${err}`));
				})
				.catch(err => { console.error(`[GPR2] ${err}`); reject(err) });
		})
	},

	/**
	 * Punishes a specific user by giving them the punish role and logging when the user was initially punished.
	 * Note: Function takes a `Discord.Message` because bot needs to reference the message later to determine when
	 *       to release the user
	 * @param {Discord.Message} msg The message that caused the user to be punished
	 * @returns {Promise} - Resolve contains nothing, reject contains error
	 */
	punishUser: function(msg) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					let _member = msg.member;
					conn.query(`SELECT UserId FROM Horny WHERE UserId = ?`, [_member.id])
						.then(rows => {
							// Make sure user isn't already being punished
							if (rows.length == 0) {
								helper.getPunishRole(msg.guild.id)
									.then(roleId => {
										// Log user as being punished (database sets time on insert)
										conn.query(
											"INSERT INTO Horny (UserId, MessageId, ChannelId, GuildId) VALUES (?, ?, ?, ?)",
											[_member.id, msg.id, msg.channel.id, msg.guild.id]);
										_member.roles.add(roleId);
									})
									.catch(err => { console.error(`[PU1] ${err}`); reject(err); })
							}
						})
						.then(_ => conn.release())
						.catch(err => {
							conn.release();
							console.error(`[PU2] ${err}`);
							reject(err);
						});
				})
				.then(resolve) // only resolve once everything is done
				.catch(dbErr => {
					console.error(`[PU3] ${dbErr}`);
					reject(dbErr);
				});
		});
	},

	/**
	 * Checks to see if any users need to be freed from punishment.
	 * Note: This does not guarantee anyone will be released, only that if user(s) have served
	 *       enough time that they will be released.
	 * @param {Discord.Client} client The bot client, used to initialize the bot and sign in
	 * @returns {Promise} - Resolve contains nothing, reject contains error
	 */
	releaseUsers: function(client) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query("SELECT Id, UserId, MessageId, ChannelId, GuildId, Time FROM Horny")
						.then(rows => {
							// Check if anyone is currently being punished
							if (rows.length > 0)
								rows.forEach(function(row) {
									// Next few lines just make sure the message still exists in the guild it was sent to
									let _guild = client.guilds.cache.get(row.GuildId);
									if (_guild) {
										let _channel = _guild.channels.cache.get(row.ChannelId);
										if (_channel) {
											let msg = _channel.messages.cache.get(row.MessageId);
											if (msg) {
												// Count how many reactions are still on message and just based off real-time value
												// (note: if someone removes their reaction, it shortens the time)
												let reaction = msg.reactions.cache.get('🔞');
												let total = reaction ? reaction.count : 0;
												let minutes = (new Date() - row.Time) / 1000 / 60;
												let sentenceTime = 0; // default to no time in case removed reactions make time below server default
												
												helper.getThresholds(msg.guild.id)
													.then(thresholds => {
														// Set `sentenceTime` to maximum punishment, defined per server/guild
														for (let i = 0; i < thresholds.length; i++)
															if (total >= thresholds[i].Count)
																sentenceTime = thresholds[i].Time
														
														// Check if user has served proper time
														if (minutes > sentenceTime) {
															helper.getPunishRole(msg.guild.id)
																.then(roleId => {
																	// Remove punishment role & entry from database - they're free!
																	_guild.members.cache.get(row.UserId).roles.remove(roleId);
																	conn.query("DELETE FROM Horny WHERE Id = ?", [row.Id]);
																})
																.catch(err => { console.error(`[RU1] ${err}`); reject(err); });
														}
													})
													.catch(err => { console.error(`[RU2] ${err}`); reject(err) });
											}
										}
									}
								});
						})
						.then(_res => conn.release())
						.catch(err => {
							conn.release();
							console.error(`[RU3] ${err}`);
							reject(err);
						});
				})
				.then(resolve) // only resolve once everything is done
				.catch(err => { console.error(`[RU4] ${err}`); reject(err); });
		});
	}
}

module.exports = helper;