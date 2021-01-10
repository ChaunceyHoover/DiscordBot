require('dotenv').config()

const { Client, Snowflake, Message } = require('discord.js');
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

const CHANNEL_REGEX = /<#(\d+)>/;

const helper = {
	plural, // While not technically database related, it's useful for displaying information from the database

	/**
	 * Does all first-time startup code relating to the database. As of now,
	 * it just frees everyone that was being punished.
	 * @param {Client} client The bot client, used to initialize the bot and sign in
	 * @returns {Promise<null, Error>} reject message contains error, resolve is empty
	 */
	init: function(client) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query('SELECT UserId, GuildId FROM Voted')
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
						.then(_ => conn.query('DELETE FROM Voted WHERE Id > 0'))
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
	 * Gets the Discord Snowflake (String) for the ID of the Role that is used to punish people with too many
	 * reactions on a message
	 * @param {Snowflake} serverId Discord Snowflake (String) for the server / guild
	 * @returns {Promise<Snowflake, Error>} Resolve contains ID of role, reject contains error
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

	/**
	 * Gets the Discord Snowflake (String) for the ID of all channels the bot will ignore in a given server
	 * @param {Snowflake} serverId The server to check for ignored channels
	 * @returns {Promise<Array<Snowflake>, Error>} Resolve contains array of ignored channels (if any), reject contains error
	 */
	getIgnoreChannels: function(serverId) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query(`SELECT Value FROM Config WHERE Property = 'IgnoreChannel' AND Server = ?`, [serverId])
						.then(rows => {
							if (rows.length > 0) {
								// filter out additional added by mariadb
								let filteredRows = [];
								rows.forEach(function(val) { filteredRows.push(val.Value); });
								resolve(filteredRows);
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
	},

	/**
	 * Punishes a specific user by giving them the punish role and logging when the user was initially punished.
	 * Note: Function takes a `Discord.Message` because bot needs to reference the message later to determine when
	 *       to release the user
	 * @param {Message} msg The message that caused the user to be punished
	 * @returns {Promise<null, Error>} Resolve contains nothing, reject contains error
	 */
	punishUser: function(msg) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					let _member = msg.member;
					conn.query(`SELECT UserId, Served FROM Horny WHERE UserId = ? AND MessageId = ? AND ChannelId = ? AND GuildId = ?`, 
					[_member.id, msg.id, msg.channel.id, msg.guild.id])
						.then(rows => {
							// Make sure user isn't already being punished
							if (rows.length == 0 || rows[0].Served == 0) {
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
	 * Adds a channel to the bot's ignored channels. Users cannot run commands in ignored channels.
	 * @param {Snowflake} serverId The ID of the server that has the desired channel
	 * @param {Snowflake} channelId The ID of the channel to be ignored within the server
	 * @returns {Promise<Number, Error>} Resolve contains status code (0 = success, 1 = channel already being ignored), reject contains error
	 */
	addIgnoreChannel: function(serverId, channelId) {
		return new Promise((resolve, reject) => {
			helper.getIgnoreChannels(serverId)
				.then(channels => {
					if (!channels.includes(channelId)) {
						pool.getConnection()
							.then(conn => {
								conn.query(
									`INSERT INTO Config (Property, Type, Value, Server) VALUES ('IgnoreChannel', 'Snowflake', ?, ?)`, 
									[channelId, serverId])
									.then(() => { conn.release(); resolve(0); })
									.catch(err => { 
										console.error(`[AIC1] ${err}`);
										conn.release(0);
										reject(err);
									});
							})
							.catch(err => {
								console.error(`[AIC2] ${err}`);
								reject(err);
							});
					} else {
						resolve(1); // channel already being ignored
					}
				})
				.catch(err => { console.error(`[AIC3] ${err}`); reject(err); });
		})
	},
  
	/**
	 * 
	 * @param {Snowflake} serverId The ID of the server that has the desired channel
	 * @param {Snowflake} channelId The ID of the channel to be unignored
	 * @returns {Promise<Number, Error>} Resolve contains status (0 = success, 1 = no channels are ignored in server, 2 = `channelId` not being ignored), reject contains error
	 */
	removeIgnoreChannel: function(serverId, channelId) {
		return new Promise((resolve, reject) => {
			helper.getIgnoreChannels(serverId)
				.then(channels => {
					if (channels.length > 0) {
						if (channels.includes(channelId)) {
							pool.getConnection()
								.then(conn => {
									conn.query(
										`DELETE FROM Config WHERE Property = 'IgnoreChannel' AND Server = ? AND Value = ?`,
										[serverId, channelId])
										.then(() => { conn.release(); resolve(0); })
										.catch(err => {
											console.error(`[RIC1] ${err}`);
											reject(err);
										})
								})
								.catch(err => {
									console.error(`[RIC2] ${err}`);
									reject(err);
								})
						} else {
							resolve(2); // channel not being ignored
						}
					} else {
						resolve(1); // no channels being ignored
					}
				})
				.catch(err => {
					console.error(`[RIC3] ${err}`);
					reject(err);
				})
		});
	},

	hasBeenVoted: function(msg) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query("SELECT Time, Yay, Nay FROM Voted WHERE MessageId = ? AND ChannelId = ? AND GuildId = ?",
						[msg.id, msg.channel.id, msg.guild.id])
						.then(rows => {
							if (rows.length == 0) {
								resolve(false);
							} else {
								let row = rows[0];
								resolve(true, row.Yay, row.Nay, row.Time);
							}
						})
						.then(() => conn.release())
						.catch(err => {
							console.error(`[HBV1] ${err}`);
							reject(err);
						});
				})
				.catch(err => {
					console.error(`[HBV2] ${err}`);
					reject(err);
				});
		})
	},

	registerMessageVoted: function(msg, yay, nay) {
		return new Promise((resolve, reject) => {
			pool.getConnection()
				.then(conn => {
					conn.query("SELECT Id FROM Voted WHERE MessageId = ? AND ChannelId = ? AND GuildId = ?",
					[msg.id, msg.channel.id, msg.guild.id])
					.then(rows => {
						if (rows.length > 0) {
							resolve(false);
						} else {
							conn.query("INSERT INTO Voted (UserId, MessageId, ChannelId, GuildId, Yay, Nay) VALUES (?, ?, ?, ?, ?, ?)",
							[msg.member.user.id, msg.id, msg.channel.id, msg.guild.id, yay, nay])
								.then(() => { conn.release(); resolve(true); })
								.catch(err => {
									console.error(`[RMV1] ${err}`);
									reject(err);
								});
						}
					})
					.catch(err => {
						console.error(`[RMV2] ${err}`);
						reject(err);
					});
				})
				.catch(err => {
					console.error(`[RMV3] ${err}`);
					reject(err);
				});
		});
	}
}

module.exports = helper;