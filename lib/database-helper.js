require('dotenv').config()

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

const helper = {
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
                .then(resolve);
        });
    },
    getThresholds: function(serverId) {
        return new Promise((resolve, reject) => {
            pool.getConnection()
                .then(conn => {
                    conn.query("SELECT Value FROM Config WHERE Property = 'ReactionThreshold' AND Server = ?", [serverId])
                        .then(rows => {
                            let filteredRows = [];
                            const regex = /(\d+):(\d+)/;
                            for (let i = 0; i < rows.length; i++) {
                                let result = regex.exec(rows[i].Value);
                                filteredRows.push({ Count: Number.parseInt(result[1]), Time: Number.parseInt(result[2]) });
                            }
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
    getPunishRole: function(serverId) {
        return new Promise((resolve, reject) => {
            pool.getConnection()
                .then(conn => {
                    conn.query("SELECT Value FROM Config WHERE Property = 'PunishRoleId' AND Server = ?", [serverId])
                        .then(rows => {
                            if (rows.length >= 1) {
                                resolve(rows[0].Value);
                            } else {
                                reject("");
                            }
                        })
                        .then(_ => conn.release())
                        .catch(err => console.error(`[GPR1] ${err}`));
                })
                .catch(err => { console.error(`[GPR2] ${err}`); reject(err) });
        })
    },
    punishUser: function(msg) {
        return new Promise((resolve, reject) => {
            pool.getConnection()
            .then(conn => {
                let _member = msg.member;
                conn.query(`SELECT UserId FROM Horny WHERE UserId = ?`, [_member.id])
                    .then(rows => {
                        if (rows.length == 0) {
                            helper.getPunishRole(msg.guild.id)
                                .then(roleId => {
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
            .then(resolve)
            .catch(dbErr => {
                console.error(`[PU3] ${dbErr}`);
                reject(dbErr);
            });
        });
    },
    releaseUsers: function(client) {
        return new Promise((resolve, reject) => {
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
                                            let msg = _channel.messages.cache.get(row.MessageId);
                                            if (msg) {
                                                let total = msg.reactions.cache.get('🔞').count;
                                                let minutes = (new Date() - row.Time) / 1000 / 60;
                                                let sentenceTime = 15;
                                                
                                                helper.getThresholds(msg.guild.id)
                                                    .then(thresholds => {
                                                        for (let i = 0; i < thresholds.length; i++)
                                                            if (total >= thresholds[i].Count)
                                                                sentenceTime = thresholds[i].Time
                                                        
                                                        if (minutes > sentenceTime) {
                                                            helper.getPunishRole(msg.guild.id)
                                                                .then(roleId => {
                                                                    _guild.members.cache.get(row.UserId).roles.remove(roleId);
                                                                    conn.query("DELETE FROM Horny WHERE Id = ?", [row.Id]);
                                                                })
                                                                .catch(err => { console.error(`[RU2] ${err}`); reject(err); });
                                                        }
                                                    })
                                                    .catch(err => { console.error(`[RU1] ${err}`); reject(err) });
                                            }
                                        }
                                    }
                                });
                        })
                        .then(_res => {
                            conn.release();
                            resolve();
                        })
                        .catch(err => {
                            conn.release();
                            console.error(`[RU3] ${err}`);
                            reject(err);
                        });
                })
                .then(resolve);
        });
    }
}

module.exports = helper;