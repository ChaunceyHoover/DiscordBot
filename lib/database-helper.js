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

function plural(number) {
	number = Number.parseInt(number);
	return number > 1 ? 's' : '';
}

/**
 * A struct for storing the minimum number of reactions (`Count`) to warrant
 * some number of minutes (`Time`) as a punishment.
 */
class Threshold {
	/** The regex to match a string value to Threshold object */
	static regex = /(\d+):(\d+)/;

	/**
	 * @param {Int} count The amount of reactions required
	 * @param {Int} time The amount of minutes to be punished for the amount of reactions
	 */
	constructor(count=0, time=0) {
		this.Count = Number.parseInt(count) || 0;
		this.Time = Number.parseInt(time) || 0;
	}

	/** Serializes the object to a string in the format "Count:Time" */
	get serialized() {
		return `${this.Count}:${this.Time}`;
	}
}

const helper = {
	Threshold,

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
							for (let i = 0; i < rows.length; i++) {
								let result = Threshold.regex.exec(rows[i].Value);
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
				.catch(err => { console.error(`[GPR2] ${err}`); reject(err); });
		})
	},

	getIgnoreChannels: function(serverId) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query(`SELECT Value FROM Config WHERE Property = 'IgnoreChannel' AND Server = ?`, [serverId])
						.then(rows => {
							if (rows.length > 0) {
								// filter out additional added by mariadb
								let filteredRows = [];
								rows.forEach(function(val) { filteredRows.push(val); });
								resolve(filteredRows)
							} else {
								resolve([]);
							}
						})
						.then(() => conn.release())
						.catch(err => {
							console.error(`[GIC] ${err}`);
							reject(err);
							conn.release();
						});
				})
				.catch(err => { console.error(`[GIC] ${err}`); reject(err); });
		})
	}

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
	},

	setThreshold: function(serverId, newThreshold) {
		return new Promise((resolve, reject) => {
			let thresholdChangeType = 0; // 0 = add, 1 = update
			pool.getConnection()
				.then(conn => {
					conn.query(`SELECT Id, Value FROM Config WHERE Server = ? AND Property = 'ReactionThreshold'`, [serverId])
						.then(rows => {
							let found = false;

							if (rows.length > 0) {
								let thresholds = [];

								rows.forEach(function(row) {
									let result = Threshold.regex.exec(row.Value);
									if (result) {
										let threshold = new Threshold(result[1], result[2]);
										threshold.Id = Number.parseInt(row.Id);
										thresholds.push(threshold);
									}
								});

								for (let i = 0; i < thresholds.length; i++) {
									let threshold = thresholds[i];
									if (threshold.Count == newThreshold.Count) {
										found = true;
										thresholdChangeType = 1;
										conn.query(`UPDATE Config SET Value = ? WHERE Id = ? AND Server = ? AND Property = 'ReactionThreshold'`, 
											[newThreshold.serialized, threshold.Id, serverId])
											.catch(updateErr => {
												conn.release();
												console.error(`[ST1] ${updateErr}`);
												reject(updateErr);
											});
									}
								}
							}

							if (!found) {
								conn.query(`INSERT INTO Config (Property, Type, Value, Server) 
									VALUES ('ReactionThreshold', 'Threshold', ?, ?)`,
									[newThreshold.serialized, serverId])
									.catch(insertErr => {
										conn.release();
										console.error(`[ST2] ${insertErr}`);
										reject(insertErr);
									});
							}
						})
						.then(_ => { conn.release(); resolve(thresholdChangeType); })
						.catch(err => {
							conn.release();
							console.error(`[ST3] ${err}`);
							reject(err);
						})
				})
				.catch(err => { console.error(`[ST4] ${err}`); reject(err); });
		});
	},

	removeThreshold: function(serverId, count) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query(`SELECT Id, Value FROM Config WHERE Server = ? AND Property = 'ReactionThreshold'`, [serverId])
						.then(rows => {
							if (rows.length > 0) {
								rows.forEach(function(row) {
									let result = Threshold.regex.exec(row.Value);
									if (result) {
										let threshold = new Threshold(result[1], 0);
										threshold.Id = Number.parseInt(row.Id);

										if (threshold.Count == count) {
											conn.query(`DELETE FROM Config WHERE Server = ? AND Property = 'ReactionThreshold' AND Id = ?`,
											[serverId, row.Id])
												.then(() => { 
													conn.close();
													resolve(0);
												})
												.catch(err => { console.error(`[RT1] ${err}`); reject(err); })
										}
									}
								});
							} else {
								resolve(1);
							}
						})
						.then(_ => conn.release())
						.catch(err => {
							conn.release();
							console.error(`[RT2] ${err}`);
							reject(err);
						})
				})
				.catch(err => { console.error(`[RT3] ${err}`); reject(err); });
		});
	},

	viewThresholds: function(serverId) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query(`SELECT Id, Value FROM Config WHERE Server = ? AND Property = 'ReactionThreshold'`, [serverId])
						.then(rows => {
							if (rows.length == 0) {
								resolve('No thresholds exist for this server. :fearful:');
							} else {
								let thresholds = '**Server Thresholds:**\n```';
								for (let i = 0; i < rows.length; i++) {
									let row = rows[i];
									let result = Threshold.regex.exec(row.Value);
									let threshold = new Threshold(result[1], result[2]);
									if (result) {
										thresholds += 
											`${result[1]} react${plural(threshold.Count)} = ${result[2]} minute${plural(threshold.Time)}\n`;
									} else {
										console.error(`Invalid threshold value ([ID:${row.Id}]${row.Value})`);
										reject(`Invalid threshold value ([ID:${row.Id}]${row.Value})`);
									}
								}

								thresholds = thresholds.substr(0, thresholds.length - 1) + '```';
								resolve(thresholds);
							}
						})
						.then(() => conn.release())
						.catch(err => { console.error(`[VT] ${err}`); reject(err); });
				})
				.catch(err => { console.error(`[VT] ${err}`); reject(err); })
		});
	}
}

module.exports = helper;