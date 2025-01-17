/**
 * tools.js is the functions module for Juke's SWGoH Discord bot
 * @author PixEye@pixeye.net
 * @since 2019-12-09
 */

// jshint esversion: 8

// Extract the required classes from the discord.js module:
const { RichEmbed } = require("discord.js");

// Create an instance of a Discord client:
//const client = new Client();

// Remember when this program started:
//const start = Date();

// Database connection:
const mysql = require("mysql");

// Load other module(s):
const locutus = require("./locutus"); // Functions from locutus.io
const swgoh   = require("./swgoh");  // SWGoH API
//nst tools   = require("./tools"); // Several functions (self file)
const view    = require("./view"); // Functions used to display results

// Get the configuration & its template from a separated JSON files:
let config = require("./config.json");
// let tplCfg = require("./config-template.json");

const unitRealNames  = require("../data/unit-names");
const unitAliasNames = require("../data/unit-aliases");

// Prepare DB connection pool:
const db_pool = mysql.createPool({
	connectionLimit: config.db.conMaxCount,
	database       : config.db.name,
	host           : config.db.host,
	password       : config.db.pass,
	user           : config.db.user
});

// Behaviour icons (about players):
const behaveIcons   = [':green_heart:', ':large_orange_diamond:', ':red_circle:'];

exports.alreadyFetchedGuildIds = [];

/** Shuffle an array
 * @param {Array} anArr The array to shuffle
 * @see: https://www.w3schools.com/js/js_array_sort.asp
 */
exports.arrayShuffle = function(anArr) {
	var i, j, t;

	for (i = anArr.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * i);

		t = anArr[i];
		anArr[i] = anArr[j];
		anArr[j] = t;
	}
};

/** Check for Galactic Legends requirements TODO
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.checkLegendReq = function(player, message) {
	const req = require("../data/gl-checklist");

	let color = "GREEN";
	let concatUpMsg = message.words.filter(word => !word.includes('<'))
		.join("").trim().toUpperCase();
	let found = false;
	let glNames = [];
	let lines = [];
	let logPrefix = exports.logPrefix; // shortcut
	let msg = "";
	let picture = "";
	let resumes = [];
	let unitsOfInterest = req.units;

	if (typeof player === "undefined") player = message.author;

	if (typeof player.game_name === "undefined") {
		player.game_name = message.author.username;
	}
	if (typeof player.name === "undefined") {
		player.name = player.game_name;
	}
	msg = "checkLegendReq() called about player: " + player.game_name;
	console.log(logPrefix()+msg);

	if (unitAliasNames[concatUpMsg]) concatUpMsg = unitAliasNames[concatUpMsg];
	console.log(logPrefix()+"Looking for unit matching '"+concatUpMsg+"'");
	if (concatUpMsg==="REY") concatUpMsg = "GLREY";

	unitsOfInterest.forEach(unit => {
		if (found) return;

		let progresses = [];

		lines = [];
		unit.name = unit.unitName;
		unit.baseId = unit.baseId.replace("TBD_", "").trim();
		glNames.push(unit.baseId);

		unit.baseId = unit.baseId.toUpperCase();
		switch(unit.baseId) {
			case "GK":
				unit.baseId = "JEDIMASTERKENOBI"; break;
			case "EXECUTOR":
				unit.baseId = "CAPITALEXECUTOR"; break;
			case "LV":
				unit.baseId = "LORDVADER"; break;
			case "REY":
				unit.baseId = "GLREY"; break;
		}
		if (unitAliasNames[unit.baseId]) unit.baseId = unitAliasNames[unit.baseId];

		msg = "Checking unit: " + unit.name+" ("+unit.baseId+")";
		console.log(logPrefix()+msg);

		msg = "Checking unit: **" + unit.name+"**";
		lines.push(msg);

		const uid = unitAliasNames[unit.baseId] || unit.baseId;
		const playerGl = player.unitsData.find(u => u.name === uid);
		const locked = ! playerGl;
		let indicator = locked? ':green_circle:': ':white_check_mark:';

		unit.name = unitRealNames[unit.baseId] || unit.name;
		if (!locked) {
			// console.log(logPrefix()+unit.name+" ("+unit.baseId+") is unlocked.");
			progresses.push(1);
		} else {
			unit.requiredUnits.forEach(req => {
				let levels = "";
				let playerUnit = player.unitsData.find(u => u.name === req.baseId);
				let progress = 0;
				let unitName = unitRealNames[req.baseId] || req.baseId;

				if (!playerUnit) {
					playerUnit = {"gear": 0, "relic": 0, "stars": 0};
					if (!req.gearLevel)
						levels = "`"+playerUnit.stars+"/"+req.stars+"`:star:";
					else
						levels = "`"+"G00/"+req.gearLevel+"; R"+playerUnit.relic+"/"+req.relicTier+"`";
					msg = levels+": "+unitName;
					progresses.push(progress);
					lines.push("❌ "+msg+" is locked! 0%");
					return;
				}

				if (req.stars) { // special case of ships
					levels = playerUnit.stars+"/"+req.stars;
					msg = "`"+levels+"`:star:: "+unitName;

					if (playerUnit.stars < req.stars) {
						progress = playerUnit.stars / req.stars;
						lines.push("🔺 "+msg+" is only "+playerUnit.stars+"⭐. "+(progress*100).toFixed()+"%");
					} else {
						progress = 1;
						lines.push("✅ "+msg+" is ready.");
					}
					progresses.push(progress);
					return;
				}

				if (playerUnit.gear<=9) playerUnit.gear = "0"+playerUnit.gear;
				levels = "G"+playerUnit.gear+"/"+req.gearLevel+"; R"+playerUnit.relic+"/"+req.relicTier;
				msg = "`"+levels+"`: "+unitName;

				progress = playerUnit.stars / 10;
				if (playerUnit.stars < 7) {
					progresses.push(progress);
					lines.push("🔺 "+msg+" is only "+playerUnit.stars+"⭐. "+(progress*100).toFixed()+"%");
					return;
				}

				progress = playerUnit.gear / (req.gearLevel + req.relicTier);
				if (playerUnit.gear < req.gearLevel) {
					progresses.push(progress);
					lines.push("😕 "+msg+" in progress. "+(progress*100).toFixed()+"%");
					return;
				}

				progress = .9 + .1*(playerUnit.relic/req.relicTier);
				if (playerUnit.relic < req.relicTier) {
					progresses.push(progress);
					lines.push("👉 "+msg+" in progress. "+(progress*100).toFixed()+"%");
					return;
				}

				progress = 1;
				progresses.push(progress);
				lines.push("✅ "+msg+" is ready.");
			}); // end of loop on requirements
		}

		if (progresses.length) {
			const sum = progresses.reduce((a, b) => a + b, 0);
			let avg = 100*sum/progresses.length || 0;
			let average = "";

			avg = Math.floor(avg);
			average = avg.toString();
			while (average.length < 3) average = " " + average;
			const resume = "~ `" + average + "%` for "+unit.name;

			lines.push(resume);
			if (avg<100) indicator = '👉';
			if (avg< 80) indicator = '🤔';
			if (avg< 65) indicator = '🔶';
			if (avg< 50) indicator = '🔺';

			resumes.push(indicator+' '+resume);

			progresses = [];
			if (avg<100) color = "ORANGE";
		}

		if ( concatUpMsg && (concatUpMsg.includes(unit.baseId) || unit.baseId.includes(concatUpMsg)) ) {
			found = true;
			picture = unit.image;
			console.log(logPrefix()+unit.name+" found");
		}
	}); // end of loop on units

	if (!found) lines = resumes;

	let richMsg = new RichEmbed()
		.setTitle(player.name+"'s unit status")
		.setDescription(lines).setColor(color)
		.setTimestamp(player.updated)
		.setFooter(config.footer.message, config.footer.iconUrl);

	if (picture) {
		richMsg.setThumbnail("https://swgoh.gg"+picture);
	}

	message.channel.send(richMsg).catch(function(ex) {
		console.warn(ex);
		message.reply(ex.message);
		message.channel.send(lines);
	});
};

/** Check for missing modules in a player's roster
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.checkPlayerMods = function(player, message) {
	let logPrefix = exports.logPrefix; // shortcut
	let maxLines = 5;

	if (!player.name) {
		console.log(logPrefix()+"invalid name at T50 for user:", player);
		return;
	}

	let color = "GREEN";
	let lines = [];
	let maxModsCount = 6;
	let minCharLevel = 50;
	let n = 0;
	let unitsWithoutAllModules = player.unitsData.filter(unit => { // Main filter:
		return unit.combatType===1 && unit.level>=minCharLevel && unit.mods.length<maxModsCount;
	}).sort((a, b) => b.gp - a.gp); // sort by descending galactic power (GP)

	let tpmmc = 0; // total player's missing modules count

	n = unitsWithoutAllModules.length;
	console.log(logPrefix()+"%d unit(s) with missing modules found.", n);
	// console.dir(player.unitsData);

	if (n === 0) {
		console.log(logPrefix()+"There is 0 known units with missing modules in this roster.");
		lines = ["All player's level 50+ characters have "+maxModsCount+" modules."];
	} else {
		color = "ORANGE";
		unitsWithoutAllModules.forEach(function(unit, i) {
			tpmmc += maxModsCount - unit.mods.length;
			if (i<maxLines) {
				let uGp = unit.gp < 1e4 ? '0' + unit.gp : unit.gp;
				let uid = unit.name;
				let fullName = unitRealNames[uid] || uid;
				let nbMissMods = maxModsCount - unit.mods.length;

				lines.push(nbMissMods+" missing module(s) on: (GP=`"+uGp+"`) "+fullName);
			} else if (i===maxLines) {
				lines.push("And "+(n-maxLines)+" more...");
			}
		});
		console.log(logPrefix()+"%d total character(s) with %d total missing modules found.", tpmmc, maxModsCount);
	}

	let richMsg = new RichEmbed()
		.setTitle(player.name+" has "+n+" unit(s) with "+tpmmc+" missing module(s)")
		.setDescription(lines).setColor(color)
		.setTimestamp(player.updated)
		.setFooter(config.footer.message, config.footer.iconUrl);

	message.channel.send(richMsg).catch(function(ex) {
		console.warn(ex);
		message.reply(ex.message);
		message.channel.send(lines);
	});
};

/** Check units GP against a threshold
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.checkUnitsGp = function(player, message, limit) {
	let logPrefix = exports.logPrefix; // shortcut

	if (!player.name) {
		console.log(logPrefix()+"invalid name at T100 for user:", player);
		return;
	}

	let color = "GREEN";
	let minit = limit-1;
	let lines = [];
	let maxGp = limit*1000;
	let maxLines = 10;
	let minGp = minit*1000;
	let n = 0;
	let units = player.unitsData.filter(function(unit) {
			// Main filter:
			return unit.combatType===1 && unit.gp>minGp && unit.gp<maxGp;
		}).sort(function(a, b) {
			return b.gp-a.gp; // sort by galactic power (descending GP)
		});

	n = units.length;
	console.log(logPrefix()+"%d unit(s) on the border-line.", n);
	// console.dir(player.unitsData);

	if (n === 0) {
		console.log(logPrefix()+"There is 0 known units on the border line in this roster.");
		lines = ["There is no player's characters between "+minGp+" and "+maxGp+" of GP."];
	} else {
		color = "ORANGE";
		units.forEach(function(u, i) {
			if (i<maxLines)
				lines.push("(GP="+u.gp+"; G"+u.gear+"; "+u.zetaCount+"z) "+u.name);
			else if (i===maxLines)
				lines.push("And "+(n-maxLines)+" more...");
		});
		console.log(logPrefix()+"%d total character(s) with GP between %dk & %dk.", n, minit, limit);
	}

	let richMsg = new RichEmbed()
		.setTitle(player.name+" has "+n+" unit(s) with GP between "+minit+"k and "+limit+"k")
		.setDescription(lines).setColor(color)
		.setTimestamp(player.updated)
		.setFooter(config.footer.message, config.footer.iconUrl);

	message.channel.send(richMsg).catch(function(ex) {
		console.warn(ex);
		message.reply(ex.message);
		message.channel.send(lines);
	});

	player.unitsData.forEach(function(u) { // u = current unit
		lines.push(
			[u.allycode, u.name, u.combatType, u.gear, u.gp, u.relic, u.zetaCount]
		);
	});
};

/** Add 2 minus characters in an ally code for better readability
 * @param {number} allyCode
 * @returns {string} A more readable version of the given ally's code
 */
exports.cleanAc = function(allyCode) {
	var ret = allyCode.toString();

	ret = ret.substr(0, 3) + "-" + ret.substr(3, 3) + "-" + ret.substr(6, 3);

	return ret;
}

/** Cloner (mainly for objects)
 * @param {object} x The object to clone
 * @returns {object}
 */
exports.clone = function(x) {
	return JSON.parse(JSON.stringify(x));
}

/** Close database connexion
 * @param {object} exc Potential exception
 */
exports.db_close = function(exc) {
	let logPrefix = exports.logPrefix; // shortcut

	if (exc) {
		console.warn(logPrefix()+"DB closing exception:", exc);
	}

	if (db_pool && typeof db_pool.end==='function') db_pool.end();

	console.log(logPrefix()+"DB connections stopped.");
};

/** Convert a number into a string using engineer notation (K, M, B, ...) */
exports.eng_format = function(amount, precision = 0) {
	let unit = "";
	let x = typeof amount === "string"? parseFloat(amount): 0 + amount;

	if (x>1024) { x /= 1024; unit = "K"; }
	if (x>1024) { x /= 1024; unit = "M"; }
	if (x>1024) { x /= 1024; unit = "G"; }
	if (x>1024) { x /= 1024; unit = "P"; }

	return x.toFixed(precision) + unit;
}

/** Get data from the SWGoH-help API
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 * @param {function} callback Function to call with fetched data
 */
exports.fetchSwgohData = function(player, message, callback) {
	let allycode = player.allycode;

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	message.channel.send("Looking for stats about ally: "+allycode+"...")
		.then(msg => {
			swgoh.fetch(player, message, function(data) {
				if (typeof msg.delete==="function") msg.delete();

				if (typeof callback==="function") callback(data, message, player);
			});
		})
		.catch(console.error);
};

/** Try to find an ally code in the words of the user's message
 * @param {object} words An array of strings (words of the original message)
 */
exports.getFirstAllycodeInWords = function(words) {
	let allycode = 0;
	let foundAt = -1;
	let logPrefix = exports.logPrefix; // shortcut

	if (words.join("").trim().length>0) {
		words.forEach(function(word, i) {
			// ignore too short words, tags/mentions & not numeric words:
			if (foundAt<0 && word.length>8 && word.indexOf("<")<0 && !word.match(/[a-z]/i) && word.match(/[0-9]{3,}/)) {
				allycode = parseInt(word.replace(/[^0-9]/g, ""));
				foundAt = i;
				console.log(logPrefix()+"Found allycode %d at position %d", allycode, i);
			}
		});

		if (foundAt>=0) {
			words.splice(foundAt, 1); // remove the allycode word from the command
		}
	}

	return allycode;
};

/** Get guild data from the database
 * @param {object} player1 The target player
 * @param {object} message The origin message (request)
 * @param {function} callback Function to call with fetched data
 */
exports.getGuildDbStats = function(player1, message, callback) {
	let allycode = player1.allycode;
	let locale = config.discord.locale; // shortcut
	let logPrefix = exports.logPrefix; // shortcut
	let sql = "";

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	sql = "SELECT * FROM `guilds` g"; // get guild
	sql+= " WHERE swgoh_id IN (SELECT guildRefId from `users` WHERE allycode=?)";

	message.channel.send("Looking for DB stats of guild with ally: "+allycode+"...")
		.then(msg => {
			db_pool.query(sql, [allycode], function(exc, result) {
				if (typeof msg.delete==="function") msg.delete();

				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					console.log("SQL:", sql);
					console.log(logPrefix()+"GDDBS Exception:", otd);
					message.reply("GGDBS Error: "+otd);
					return;
				}

				// console.log(logPrefix()+"result:", result); // id, swgoh_id, name
				let n = result.length;

				msg = n+" matching guilds found";
				if (n!==1) {
					console.warn(logPrefix()+msg);
					message.reply(msg);
					return;
				}

				let guild = result[0];
				msg = "Matching guild: %s (%s)";
				guild.refId = guild.swgoh_id;
				console.log(logPrefix()+msg, guild.name, guild.refId);

				sql = "SELECT * from `users` WHERE guildRefId=?"; // get players
				db_pool.query(sql, [guild.refId], function(exc, result) {
					if (exc) {
						let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

						console.log("SQL:", sql);
						console.warn(logPrefix()+"GDDBS Exception:", otd);
						message.reply("GGDBS Error: "+otd);
						return;
					}

					let allycodes = [];

					msg = "%d players in DB guild: "+guild.name;
					console.log(logPrefix()+msg, result.length);

					guild.gpAvg = Math.round(guild.gp/result.length);
					msg = "PG: %s; Average PG: "+guild.gpAvg.toLocaleString(locale);
					console.log(logPrefix()+msg, guild.gp.toLocaleString(locale));

					guild.players = {};
					result.forEach(function(player) {
						allycodes.push(player.allycode);
						guild.players[player.allycode] = player;
						if (player.allycode === player1.allycode) player1 = player;
					});

					guild.relics = 0;
					sql = "SELECT * from `units` WHERE allycode IN (?)"; // get units
					db_pool.query(sql, [allycodes], function(exc, result) {
						if (exc) {
							let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

							console.log("SQL:", sql);
							console.log(logPrefix()+"GDDBS Exception:", otd);
							message.reply("GGDBS Error: "+otd);
							return;
						}

						n = result.length;
						msg = n.toLocaleString(locale)+" matching units found";
						if (!n) {
							console.warn(logPrefix()+msg+"!");
							message.reply("GGDBS Error: " +msg+"!");
							return;
						}

						console.log(logPrefix()+msg);
						result.forEach(function(u) {
							guild.relics += u.relic;

							if (!guild.players[u.allycode].unitsData)
								guild.players[u.allycode].unitsData = {};

							guild.players[u.allycode].unitsData[u.name] = u;
						});

						if (typeof callback==="function") // TODO: change allycode to player
							callback(allycode, message, guild);
					});
				});
			});
		})
		.catch(console.error);
};

/** Get guild data from the SWGoH-help API
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 * @param {function} callback Function to call with fetched data
 */
exports.getGuildStats = function(player, message, callback) {
	let allycode = player.allycode;

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	message.channel.send("Looking for stats of guild with ally: "+allycode+"...")
		.then(msg => {
			swgoh.getPlayerGuild(allycode, message, function(guild) {
				if (typeof msg.delete==="function") msg.delete();

				// Remember stats of the guild:
				exports.rememberGuildStats(guild);

				if (typeof(callback)==="function") callback(guild, message, player);
			});
		})
		.catch(console.error);
};

/** Get a specified player's last evolutions
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.getLastEvolsFromDb = function(player, message) {
	let allycode = player.allycode;
	let logPrefix = exports.logPrefix; // shortcut
	let low_words = message.words.join("").toLowerCase();
	let sql = "SELECT * FROM `evols` WHERE allycode="+parseInt(allycode);

	if (low_words==="hidegifts" || low_words==="hg") {
		sql += " AND type <> 'newGifts'";
	}
	sql += " ORDER BY `ts` DESC LIMIT 50";

	db_pool.query(sql, function(exc, result) {
		if (exc) {
			let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

			console.log("SQL:", sql);
			console.log(logPrefix()+"GLA Exception:", otd);
			return;
		}

		console.log(logPrefix()+"%d evols match allycode:", result.length, allycode);

		view.showLastEvols(player, message, result);
	});
};

/** Get player's data from our database
 * @param {number} allycode The target allycode (9 digits)
 * @param {object} message The origin message (request)
 */
exports.getPlayerFromDatabase = function(allycode, message, callback) {
	let logPrefix = exports.logPrefix; // shortcut
	let msg = "";
	let player = null;
	let sql = "SELECT * FROM `users` WHERE allycode="+parseInt(allycode);

	db_pool.query(sql, function(exc, result) {
		if (exc) {
			console.log("SQL:", sql);
			console.log(logPrefix()+"GPFDB1 Exception:", exc.sqlMessage? exc.sqlMessage: exc);
			message.reply("Failed #1! "+(exc.sqlMessage? exc.sqlMessage: exc));

			return;
		}

		if (result.length!==1) {
			msg = result.length+" record(s) match(es) allycode: "+allycode+"!";
			console.warn(logPrefix()+msg);
			message.reply(msg);
		}

		if ( ! result.length ) { // no result
			console.log(logPrefix()+"User with allycode "+allycode+" not registered.");
			message.channel.send("I don't know this player yet. You may use the 'register' command.");
			player = {"game_name": allycode};
		} else { // One or more result(s):
			player = result[result.length - 1]; // take last match <-----
			console.log(logPrefix()+"Ally w/ code "+allycode+" is:", player.game_name);
		}

		// Get player's units:
		sql = "SELECT * FROM `units` WHERE allycode="+parseInt(allycode);

		db_pool.query(sql, function(exc, result) {
			if (exc) {
				console.log("SQL:", sql);
				console.log(logPrefix()+"GPFDB2 Exception:", exc.sqlMessage? exc.sqlMessage: exc);
				message.reply("Failed #3! "+(exc.sqlMessage? exc.sqlMessage: exc));
				return;
			}

			if (!result.length)
				console.warn(logPrefix()+"GPFDB get %d characters for:", result.length, player.game_name);

			// Add units to the player object:
			player.unitsData = {"length": 0};
			result.forEach(function(u) {
				player.unitsData.length++;
				player.unitsData[u.name] = u;
			});

			if (typeof(callback)==="function") callback(player, message);
		});
	});
};

/** Get player's data from a Discord user object (Discord tag)
 * @param {object} user The target player
 * @param {object} message The origin message (request)
 * @param {function} callback Function to call with fetched data
 */
exports.getPlayerFromDiscordUser = function(user, message, callback) {
	let discord_id = user.id;
	let logPrefix = exports.logPrefix; // shortcut
	let sql = "SELECT p.*, g.name AS guildName FROM `users` p"+
		" LEFT JOIN `guilds` g ON p.guildRefId=g.swgoh_id"+
		" WHERE p.discord_id='"+discord_id+"'";

	db_pool.query(sql, function(exc, result) {
		if (exc) {
			console.log("SQL:", sql);
			console.log(logPrefix()+"GPFDI Exception:", exc.sqlMessage? exc.sqlMessage: exc);
			return;
		}

		let player = result.length>0? result[0]:
			{"discord_id": user.id, "discord_name": user.username};

		player.displayAvatarURL = user.displayAvatarURL;
		console.log(logPrefix()+result.length+" record(s) match(es) user's ID:", discord_id);
		if (result.length > 1) {
			let color  = "ORANGE";
			let guilds = {};
			let lines  = [];
			let now    = new Date();
			let title  = result.length+" record(s) match(es) this Discord ID!";

			console.warn(logPrefix()+title);
			result.forEach(function(user) {
				let msg = " is allycode of: **"+user.game_name+"**";

				if (user.guildRefId) {
					if (user.guild_name) msg+= " (from guild: "+user.guild_name+")";
					guilds[user.guildRefId] = user.guildRefId;
				}
				console.log(logPrefix()+user.allycode+msg);
				lines.push("`"+exports.cleanAc(user.allycode)+"`"+msg);
			});

			let richMsg = new RichEmbed().setColor(color).setTitle(title)
				.setDescription(lines).setTimestamp(now)
				.setFooter(config.footer.message, config.footer.iconUrl);

			message.reply(richMsg).catch(function(ex) {
				console.warn(ex);
				message.reply(ex.message);
				message.reply(title);
				message.channel.send(lines);
			});
			if (typeof(callback)==="function") callback(player);
		} else if (result.length === 1) { // 1 match, perfect!
			console.log(logPrefix()+"Found allycode: %d (%s)", player.allycode, player.discord_name);
			// console.log(logPrefix()+"Found player: %s", JSON.stringify(player));

			if (typeof(callback)==="function") callback(player);
		} else { // no match:
			let msg = "This user has no player ID. You may try: ";

			console.log( "SQL:\n"+sql); // Normal for "self(y)" command
			console.warn(logPrefix()+"User not found"); // Normal for "self(y)" command
			message.reply(msg+config.discord.prefix+"register your-ally-code");
		}
	});
};

/** Get one or more players game stats
 * @param {Object} users - An arry of users
 * @param {Object} message - The message to reply to
 * @param {Object} callback - The callback function
 */
exports.getPlayerStats = function(users, message, callback) {
	let allycodes = [];
	let playersByAllycode = {};

	if (!(users instanceof Array)) users = [users];

	users.forEach(function(user) {
		allycodes.push(user.allycode);
		playersByAllycode[user.allycode] = user;
	});

	if (!allycodes || ["number", "object"].indexOf(typeof allycodes)<0) {
		message.reply(":red_circle: Invalid or missing allycode(s)! Try 'register' command.");
		return;
	}

	let str = allycodes.length===1? allycodes[0]+"'s": allycodes.length+" allycodes";

	message.channel.send("Looking for "+str+" stats...")
		.then(msg => {
			swgoh.getPlayerData(users, function(player, message) {
				if (typeof msg.delete === "function") msg.delete();

				player.displayAvatarURL =
					playersByAllycode[player.allycode].displayAvatarURL;
				exports.updatePlayerDataInDb(player, message);

				if (typeof callback === "function") callback(player, message);
			}, message);
		})
		.catch(function(exc) {
			console.error(exc);
		});
};

/** Look for unregistered players in a specified guild
 * @param {number} allycode The target player's allycode
 * @param {object} message The origin message (request)
 */
exports.getUnregPlayers = function(allycode, message) {
	let logPrefix = exports.logPrefix; // shortcut

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	message.channel.send("Looking for unregistered players of guild with ally: "+allycode+"...")
		.then(msg => {
			swgoh.getPlayerGuild(allycode, message, function(guild) {
				if (typeof(msg.delete)==="function") msg.delete();

				if (!guild.gp) {
					msg = "GUP: invalid guild GP: "+guild.gp;
					console.warn(logPrefix()+msg);
					message.reply(msg);
					return;
				}

				// Remember stats of the guild:
				exports.rememberGuildStats(guild);

				let sql = "SELECT * FROM `users` WHERE allycode IN (?)";
				let guildAllycodes = Object.keys(guild.players);
				let memberCnt = guildAllycodes.length;

				console.log(logPrefix()+"GUP: %d guild member(s).", memberCnt);
				if (memberCnt !== guild.memberCount) { // data check
					// Should not happen
					msg = "GUP: guildAllycodes.length (%d) !== guild.memberCount (%d)!";
					console.warn(msg, memberCnt, guild.memberCount);
				}

				let n = memberCnt;
				db_pool.query(sql, [guildAllycodes], function(exc, regPlayers) {
					let dbRegByAc = {};
					let nbReg = 0;
					let noProbePlayers = [];

					if (exc) {
						let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

						console.log(logPrefix()+"GUP SQL:", sql);
						console.warn(logPrefix()+"GUP Exception:", otd);
						message.reply("Failed! "+otd);
						return;
					}

					msg = "GUP: %d registered users out of %d.";
					console.log(logPrefix()+msg, regPlayers.length, memberCnt);

					let gonePlayers = {};
					regPlayers.forEach(function(regPlayer) {
						dbRegByAc[regPlayer.allycode] =
							locutus.utf8_decode(regPlayer.game_name)+" ("+regPlayer.allycode+")";

						if (regPlayer.guildRefId !== guild.swgoh_id) {
							gonePlayers[regPlayer.allycode] =
								regPlayer.game_name+" ["+regPlayer.allycode+"]";
						}

						if ( ! regPlayer.gp ) {
							noProbePlayers.push(
								regPlayer.name+" ("+regPlayer.allycode+")"
							);
						}
						++nbReg;

						if ( ! guild.players[regPlayer.allycode] ) {
							gonePlayers[regPlayer.allycode] =
								regPlayer.game_name+" ("+regPlayer.allycode+")";
						}
					});

					gonePlayers = Object.values(gonePlayers); // convert object to array
					if (gonePlayers.length) {
						msg = gonePlayers.length+" player(s) to update: "+gonePlayers.join(", ")+".";
						console.warn(logPrefix()+msg);
						message.reply(msg);
					}

					n -= nbReg;
					msg = ' unknown player(s) found in guild "'+guild.name+'"';
					console.log(logPrefix()+n+msg);

					if (!n) {
						message.channel.send(":white_check_mark: All "+guildAllycodes.length+
							' players in guild "'+guild.name+'" are registered.');
					}

					let notRegPlayers = [];
					guildAllycodes.forEach(function(allycode) {
						if (!dbRegByAc[allycode]) {
							notRegPlayers.push(guild.players[allycode]+" ("+allycode+")");
						}
					});
					dbRegByAc = Object.values(dbRegByAc).sort();
					console.log(
						logPrefix()+"GUP - "+dbRegByAc.length+" reg user(s): "+dbRegByAc.join(", ")
					);

					let userList = notRegPlayers.length? ": "+notRegPlayers.sort().join(", "): "";
					msg = "**"+memberCnt+"**"+msg+userList+".";

					console.log(logPrefix()+"GUP - Not probed users count: "+noProbePlayers.length);
					if (noProbePlayers.length) {
						msg = [msg, "**Not tested user(s):** "+noProbePlayers.join(", ")+"."];
					}

					message.channel.send(msg);
				}); // query
			}); // get guild
		}) // send msg
		.catch(function(exc) {
			console.error(exc);
			message.reply(exc);
		});
};

/** Manage players' behaviour notation (with colors)
 */
exports.handleBehaviour = function(guild, message, target) {
	let allycodes = Object.keys(guild.players);
	let authorFound = false;
	let targetFound = false;
	let limit = 10;
	let logPrefix = exports.logPrefix; // shortcut
	let readCommands = message.readCommands;

	let args = message.unparsedArgs;
	let cmd = message.behaveCommand;
	let delta = message.behaveDelta;

	console.log(logPrefix()+"Behaviour command:", cmd);

	// Get author's allycode
	exports.getPlayerFromDiscordUser(message.author, message, function(author) {
		let sql = '';

		if (readCommands.indexOf(cmd)<0 && target.allycode!==author.allycode) {
			// SECURITY checks:

			if ( ! author.isContestAdmin ) {
				message.reply("You are NOT a contest admin!");
				return;
			}

			if (!author.game_name) {
				author.game_name = locutus.utf8_decode(author.username);
			}
			console.log(logPrefix()+author.game_name+" is a contest admin.");

			if (allycodes.length)
				console.log(logPrefix()+"Type of allycodes[0]: "+typeof(allycodes[0])); // string

			if (target.allycode!==author.allycode) {
				// Check if author & target are players from the same guild:
				allycodes.forEach(function(allycode) {
					if (authorFound && targetFound) return;

					allycode = parseInt(allycode); // Convert string to number
					if (allycode === author.allycode) authorFound = true;
					if (allycode === target.allycode) targetFound = true;
				});
				if (!authorFound || !targetFound) {
					console.log(logPrefix()+"Author:\n "+JSON.stringify(author));
					console.log(logPrefix()+"Target:\n "+JSON.stringify(target));
					console.warn(logPrefix()+
						"Author's allycode="+author.allycode+" / target's allycode="+target.allycode);
					console.warn(logPrefix()+
						"Author found="+(authorFound? 'Y': 'N')+" / target found="+(targetFound? 'Y': 'N'));
					let msg = "You are NOT part of the same guild!";
					console.warn(msg);
					message.reply(msg);
					return;
				}
			}
		}

		if (cmd==='add') {
			sql = "UPDATE `users` SET `warnLevel`=`warnLevel`+? WHERE `allycode`=?";
		} else if (['rem', 'remove'].indexOf(cmd)>=0) {
			sql = "UPDATE `users` SET `warnLevel`=`warnLevel`-? WHERE `allycode`=?";
		} else if (cmd==='set') {
			sql = "UPDATE `users` SET `warnLevel`=? WHERE `allycode`=?";
		}

		if (!target.game_name) target.game_name = guild.players[target.allycode];

		if (sql) {
			db_pool.query(sql, [delta, target.allycode], function(exc, result) {
				let msg = "";

				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					console.log("SQL:", sql);
					console.warn(logPrefix()+"HBH Exception:", otd);
					return;
				}

				if (result.affectedRows !== 1) {
					msg = result.affectedRows+" user(s) updated!";
					console.log(logPrefix()+msg);
					message.reply(msg);
					return;
				}

				msg = target.game_name+' successfully updated.';
				console.log(logPrefix()+msg);
				message.reply(':white_check_mark: '+msg);
				return;
			});
			return;
		}

		if (cmd==='reset') {
			console.log(logPrefix()+args.length+" unparsed arg(s):", args.join(' '));

			sql = "UPDATE `users` SET `warnLevel`=0 WHERE `guildRefId`=?";
			db_pool.query(sql, [guild.refId], function(exc, result) {
				let color = "GREEN";
				let lines = [];

				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					color = "RED";
					console.log("SQL:", sql);
					console.warn(logPrefix()+"HBH Exception:", otd);
					message.reply("HBH Exception:"+otd);
					return;
				}

				let n = result.affectedRows;
				let s = n===1? '': 's';
				let msg = n+" updated player"+s;
				let title = "Behaviour reset";

				console.log(logPrefix()+msg);
				lines = [msg];
				let richMsg = new RichEmbed().setColor(color).setTitle(title)
					.setDescription(lines).setTimestamp(author.updated)
					.setFooter(config.footer.message, config.footer.iconUrl);
				message.channel.send(richMsg).catch(function(ex) {
					console.warn(ex);
					message.reply(ex.message);
					message.channel.send(lines);
				});
			});
			return;
		}

		let title = '';

		if (cmd!=='worst') {
			limit = 50;
			title = target.game_name+"'s behavior rank in: "+guild.name;
		}
		sql = "SELECT * FROM `users` WHERE guildRefId=?";
		if (cmd==='worst') sql+= " AND warnLevel>0";
		sql+= " ORDER BY warnLevel DESC, game_name ASC LIMIT ?";
		db_pool.query(sql, [guild.refId, limit], function(exc, result) {
			let logPrefix = exports.logPrefix; // shortcut

			if (exc) {
				let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

				console.log("SQL:", sql);
				console.warn(logPrefix()+"HBH Exception:", otd);
				return;
			}

			let color = "GREEN";
			// let lastScore = 0;
			let lines = [];
			let n = 0;
			// let rank = 0;

			console.log(logPrefix()+"%d matches found", result.length);
			if (!result.length) {
				lines = [':white_check_mark: No behaviour problem registered.'];
			} else {
				result.forEach(player => {
					let playerIcon = behaveIcons[player.warnLevel];
					let addon = player.warnLevel? "**": "";

					// if (player.warnLevel!==lastScore) ++rank;
					if (cmd==='worst' || player.allycode===target.allycode)
						lines.push(playerIcon+" "+addon+player.game_name+addon);
					// lastScore = player.warnLevel;
				});
				n = Math.min(limit, lines.length);
			}

			let s = n===1? '': 's';
			let as = n===1? "'s": "s'";
			title = n+" player"+as+" behaviour"+s+" in: "+guild.name;
			console.log(logPrefix()+"%d line%s displayed", lines.length, s);
			let richMsg = new RichEmbed().setColor(color).setTitle(title)
				.setDescription(lines).setTimestamp(author.updated)
				.setFooter(config.footer.message, config.footer.iconUrl);
			message.channel.send(richMsg).catch(function(ex) {
				console.warn(ex);
				message.reply(ex.message);
				message.channel.send(lines);
			});
		});
	});
};

/** Handle guild contest commands
 */
exports.handleContest = function(guild, message, target) {
	let allycodes = Object.keys(guild.players);
	let authorFound = false;
	let targetFound = false;
	let limit = 10;
	let logPrefix = exports.logPrefix; // shortcut
	let readCommands = message.readCommands;

	let args = message.unparsedArgs;
	let cmd = message.contestCommand;
	let delta = message.contestDelta;

	console.log(logPrefix()+"Contest command:", cmd);

	// Get author's allycode
	exports.getPlayerFromDiscordUser(message.author, message, function(author) {
		let sql = '';

		if (readCommands.indexOf(cmd)<0 && target.allycode!==author.allycode) {
			// SECURITY checks:

			if ( ! author.isContestAdmin ) {
				message.reply("You are NOT a contest admin!");
				return;
			}
			console.log(logPrefix()+author.game_name+" is a contest admin.");

			if (allycodes.length)
				console.log(logPrefix()+"Type of allycodes[0]: "+typeof(allycodes[0])); // string

			if (target.allycode!==author.allycode) {
				// Check if author & target are players from the same guild:
				allycodes.forEach(function(allycode) {
					if (authorFound && targetFound) return;

					allycode = parseInt(allycode); // Convert string to number
					if (allycode === author.allycode) authorFound = true;
					if (allycode === target.allycode) targetFound = true;
				});
				if (!authorFound || !targetFound) {
					console.log(logPrefix()+"Author:\n "+JSON.stringify(author));
					console.log(logPrefix()+"Target:\n "+JSON.stringify(target));
					console.warn(logPrefix()+
						"Author's allycode="+author.allycode+" / target's allycode="+target.allycode);
					console.warn(logPrefix()+
						"Author found="+(authorFound? 'Y': 'N')+" / target found="+(targetFound? 'Y': 'N'));
					let msg = "You are NOT part of the same guild!";
					console.warn(msg);
					message.reply(msg);
					return;
				}
			}
		}

		if (cmd==='add') {
			sql = "UPDATE `users` SET `contestPoints`=`contestPoints`+? WHERE `allycode`=?";
		} else if (['rem', 'remove'].indexOf(cmd)>=0) {
			sql = "UPDATE `users` SET `contestPoints`=`contestPoints`-? WHERE `allycode`=?";
		} else if (cmd==='set') {
			sql = "UPDATE `users` SET `contestPoints`=? WHERE `allycode`=?";
		}

		if (sql) {
			db_pool.query(sql, [delta, target.allycode], function(exc, result) {
				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					console.log("SQL:", sql);
					console.warn(logPrefix()+"GCT Exception:", otd);
					return;
				}

				if (result.affectedRows !== 1) {
					let msg = result.affectedRows+" user(s) updated!";
					console.log(logPrefix()+msg);
					message.reply(msg);
					return;
				}

				let msg = target.game_name+' successfully updated.';
				console.log(logPrefix()+msg);
				message.reply(':white_check_mark: '+msg);
				return;
			});
			return;
		}

		if (cmd==='reset') {
			console.log(logPrefix()+args.length+" unparsed arg(s):", args.join(' '));

			sql = "UPDATE `users` SET `contestPoints`=0 WHERE `guildRefId`=?";
			db_pool.query(sql, [guild.refId], function(exc, result) {
				let color = "GREEN";
				let lines = [];

				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					color = "RED";
					console.log("SQL:", sql);
					console.warn(logPrefix()+"GCT Exception:", otd);
					message.reply("GCT Exception:"+otd);
					return;
				}

				let n = result.affectedRows;
				let s = n===1? '': 's';
				let msg = n+" updated player"+s;
				let title = "Contest reset";

				console.log(logPrefix()+msg);
				lines = [msg];
				let richMsg = new RichEmbed().setColor(color).setTitle(title)
					.setDescription(lines).setTimestamp(author.updated)
					.setFooter(config.footer.message, config.footer.iconUrl);
				message.channel.send(richMsg).catch(function(ex) {
					console.warn(ex);
					message.reply(ex.message);
					message.channel.send(lines);
				});
			});
			return;
		}

		let title = "Top "+limit+" of contest for: "+guild.name;

		if (cmd!=='top') {
			limit = 50;
			title = target.game_name+"'s contest rank in: "+guild.name;
		}
		sql = "SELECT * FROM `users` WHERE guildRefId=? AND contestPoints!=0";
		sql+= " ORDER BY contestPoints DESC, game_name ASC LIMIT ?";
		db_pool.query(sql, [guild.refId, limit], function(exc, result) {
			if (exc) {
				let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

				console.log("SQL:", sql);
				console.warn(logPrefix()+"GCT Exception:", otd);
				return;
			}

			let color = "GREEN";
			let lastScore = 0;
			let lines = [];
			let rank = 0;

			console.log(logPrefix()+"%d matches found", result.length);
			result.forEach(function(player) {
				if (player.contestPoints!==lastScore) ++rank;
				if (cmd==='top' || player.allycode===target.allycode)
					lines.push("**"+rank+"/** "+player.contestPoints+" pts for: **"+player.game_name+"**");
				lastScore = player.contestPoints;
			});

			let s = lines.length===1? '': 's';
			console.log(logPrefix()+"%d line%s to display", lines.length, s);
			if (!lines.length) {
				lines = ["Every member of this guild has a contest score at zero."];
			}
			let richMsg = new RichEmbed().setColor(color).setTitle(title)
				.setDescription(lines).setTimestamp(author.updated)
				.setFooter(config.footer.message, config.footer.iconUrl);
			message.channel.send(richMsg).catch(function(ex) {
				console.warn(ex);
				message.reply(ex.message);
				message.channel.send(lines);
			});
		});
	});
};

/** Compute log prefix */
exports.logPrefix = function () {
	let dt = new Date();

	return dt.toString().replace(/ GMT.*$$/, "")+" - ";
};

/** Run the periodical process */
exports.periodicalProcess = function() {
	let now = new Date();

	if (now.getHours() === 6)
		exports.updateOldestGuildOr(exports.updateOldestPlayer);
	else {
		exports.alreadyFetchedGuildIds = [];
		exports.updateOldestPlayer();
	}
};

/** Update the oldest refreshed player
 * @param {function} callback The function to call if there is nothing left to do here
 */
exports.updateOldestGuildOr = function(callback) {
	let logPrefix = exports.logPrefix; // shortcut
	let deltaInHours = 3;
	let sql = "SELECT * FROM guilds WHERE alliance_id IS NOT NULL"+
		" AND (officerCount IS NULL OR TIMESTAMPDIFF(HOUR, ts, NOW())>"+deltaInHours+")"+
		" ORDER BY ts";
	let start = new Date();

	db_pool.query(sql, function(exc, guilds) {
		if (exc) {
			console.log("SQL:", sql);
			console.log(logPrefix()+"UOG Exception:", exc.sqlMessage? exc.sqlMessage: exc);
			return;
		}

		let now = new Date();
		let delayInMs = now.getTime() - start.getTime();
		let msg = "/ UOG check: %d guild(s) match (data > %dh; in %d ms)";

		console.log(logPrefix()+msg, guilds.length, deltaInHours, delayInMs);
		if ( ! guilds.length ) {
			if (typeof(callback)==='function' ) {
				return callback();
			} else {
				return;
			}
		}

		let g = guilds.shift(); // use the oldest one
		let message = {};

		while (exports.alreadyFetchedGuildIds.indexOf(g.id) >= 0) {
			console.warn(logPrefix()+"Guild "+g.name+" already fetched!");

			g = guilds.shift(); // keep only the oldest one
			if (typeof g === "undefined") {
				console.warn("Nothing left to fetch => stopping this process!");
				return;
			}
		}

		msg = "Start UOG process on: %s (%s / %s)...";
		console.log(logPrefix()+msg, g.name, g.gm_allycode, exports.toMySQLdate(g.ts));
		exports.alreadyFetchedGuildIds.push(g.id);

		swgoh.getPlayerGuild(g.gm_allycode, message, function(guild) {

			// Remember stats of the guild:
			exports.rememberGuildStats(guild);

			console.log(logPrefix()+'\\ End UOG process about '+guild.name);
		});
	});
};

/** Update the oldest refreshed player */
exports.updateOldestPlayer = function() {
	let logPrefix = exports.logPrefix; // shortcut
	let deltaInHours = 18;
	let sql = "SELECT allycode, game_name, ts FROM users"+
		" WHERE discord_id IS NOT NULL"+        // 63 users.discord_id are NULL on 2020-10-13
		" AND TIMESTAMPDIFF(HOUR, ts, NOW())>"+deltaInHours+ // 158 users match on 2020-10-13
		" ORDER BY ts LIMIT 5";             // count() was 178 before the LIMIT on 2020-10-13
	let start = new Date();

	db_pool.query(sql, function(exc, users) {
		if (exc) {
			console.log("SQL:", sql);
			console.log(logPrefix()+"UOP Exception:", exc.sqlMessage? exc.sqlMessage: exc);
			return;
		}

		let now = new Date();
		let delayInMs = now.getTime() - start.getTime();
		let msg = "/ UOP check: %d user(s) match (data > %dh; in %d ms)";

		console.log(logPrefix()+msg, users.length, deltaInHours, delayInMs);
		if ( ! users.length ) return;

		let u = users[0];
		msg = "Start UOP process on: %s (%s / %s)...";
		console.log(logPrefix()+msg, u.game_name, u.allycode, exports.toMySQLdate(u.ts));

		swgoh.getPlayerData([u], function(player, message) {
			exports.updatePlayerDataInDb(player, message, function() {
				let msg = "\\ UOP done for %s (%s).";

				console.log(logPrefix()+msg, player.name, player.allycode);
			});
		});
	});
};

/** Store guild data in our database
 * @param {number} allycode The target player's allycode
 * @param {object} message The origin message (request)
 * @param {function} callback The function to call once the job is done here
 */
exports.refreshGuildStats = function(allycode, message, callback) {
	let locale = config.discord.locale; // shortcut
	let logPrefix = exports.logPrefix; // shortcut

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	let sql = "SELECT * FROM `guilds` g"; // get guild

	sql+= " WHERE swgoh_id IN (SELECT guildRefId from `users` WHERE allycode=?)";

	message.channel.send("Looking for DB stats of guild with ally: "+allycode+"...")
		.then(msg => {
			db_pool.query(sql, [allycode], function(exc, result) {
				if (typeof(msg.delete)==="function") msg.delete();

				if (exc) {
					let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					console.log("SQL:", sql);
					console.log(logPrefix()+"GDDBS Exception:", otd);
					message.reply("RGS Error: "+otd);
					return;
				}

				// console.log(logPrefix()+"result:", result); // id, swgoh_id, name
				let n = result.length;

				msg = n+" matching guilds found";
				if (n!==1) {
					console.warn(logPrefix()+msg);
					message.reply(msg);
					return;
				}

				let guild = result[0];
				msg = "Matching guild: %s (%s)";
				guild.refId = guild.swgoh_id;
				console.log(logPrefix()+msg, guild.name, guild.refId);

				sql = "SELECT * from `users` WHERE guildRefId=?"; // get players
				db_pool.query(sql, [guild.refId], function(exc, result) {
					if (exc) {
						let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

						console.log("SQL:", sql);
						console.warn(logPrefix()+"GDDBS Exception:", otd);
						message.reply("RGS Error: "+otd);
						return;
					}

					let players = [];

					msg = "%d players in DB guild: "+guild.name;
					console.log(logPrefix()+msg, result.length);

					guild.gpAvg = Math.round(guild.gp/result.length);
					msg = "PG: %s; Average PG: "+guild.gpAvg.toLocaleString(locale);
					console.log(logPrefix()+msg, guild.gp.toLocaleString(locale));

					guild.players = {};
					result.forEach(function(player) {
						players.push(player);
						guild.players[player.allycode] = player;
					});

					exports.getPlayerStats(players, message, callback);
				});
			});
		})
		.catch(console.error);
};

/** Remember stats of the guild
 * @param object g The guild object to save in the database
 */
exports.rememberGuildStats = function(g) {

	let logPrefix = exports.logPrefix; // shortcut
	let sql = "INSERT INTO `guilds` (swgoh_id, name, gp, memberCount, officerCount, gm_allycode, ts) VALUES ?";
	let update = new Date(g.updated);
	let values = [[g.id, g.name, g.gp, g.memberCount, g.officerCount, g.leader.allyCode, update]];

	db_pool.query(sql, [values], function(exc, result) {
		if (exc) {
			let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

			console.log("SQL:", sql);
			console.log(logPrefix()+"GS Exception:", otd);

			// Retry with an UPDATE:
			sql = "UPDATE `guilds`"+
				" SET name=?, gp=?, memberCount=?, officerCount=?, gm_allycode=?, ts=?"+
				" WHERE swgoh_id=?";
			values = [g.name, g.gp, g.memberCount, g.officerCount, g.leader.allyCode, update, g.id];

			db_pool.query(sql, values, function(exc, result) {
				if (exc) {
					otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

					console.log("SQL:", sql);
					console.log(logPrefix()+"GS Exception:", otd);
					return;
				}

				let n = result.affectedRows;
				console.log(logPrefix()+"%d guild records updated (UPDATE).", n);
			});
			return;
		}

		let n = result.affectedRows;
		console.log(logPrefix()+"%d guild records updated (DEL+ADD).", n);
	});

	sql = "UPDATE `tw_results` SET self_guild_name=?"+
		" WHERE self_guild_id=? AND (self_guild_name='null' OR self_guild_name IS NULL)";

	db_pool.query(sql, [g.name, g.id], function(exc, result) {
		if (exc) {
			console.log("SQL UPG:", sql);
			console.log(logPrefix()+"UGTWR Exception:", exc.sqlMessage? exc.sqlMessage: exc);
			console.log("Lines:", JSON.stringify([g.name, g.id]));
			return;
		}

		let nbr = result.affectedRows; // shortcut for number of records
		console.log(logPrefix()+"%d TW results updated.", nbr);
	});
};

/** Remove an allycode from the DB
 * @param {number} allycode
 */
exports.removeAllycode = function(allycode) {
	let logPrefix = exports.logPrefix; // shortcut
	let sql = "DELETE FROM users WHERE allycode=? LIMIT 1";

	db_pool.query(sql, [allycode], function(exc /*, result */) {
		if (exc) {
			console.log(sql);
			console.warn(logPrefix()+"DelAC error: "+exc);
			return;
		}

		console.log(logPrefix()+"Allycode "+allycode+" deleted from the DB.");
	});
};

/** Compare 2 strings ignoring case
 * @param {string} a
 * @param {string} b
 * @return {number}
 */
exports.stringsCompare = function(a, b) {
	return a.localeCompare(b, undefined, {sensitivity: 'base'});
};

/** Get guild territory war results from the database to an attached file
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.territoryWarGet = function(player, message) {
	const filename = "../data/gt.csv";
	const logPrefix = exports.logPrefix; // shortcut
	const sep = ";";
	const sql = "SELECT DATE_FORMAT(created_at, '%Y-%m-%d %T') AS created_time"+
		", self_guild_name, self_player_cnt, self_score"+
		", (self_score - opp_score) AS score_diff, opp_score, opp_name"+
		" FROM `tw_results` ORDER BY score_diff DESC"; // best guilds first
	const MINUTES_BEFORE_CLEANUP = 1;

	let lines = [];

	db_pool.query(sql, [], function(exc, result) {
		if (exc) {
			let otd = exc.sqlMessage? exc.sqlMessage: exc; // object to display

			console.log("SQL:", sql);
			console.log(logPrefix()+"RTW Exception:", otd);
			message.reply("Failed: "+otd);

			return;
		}

		let ln = 0;
		let msg = "%d records embeded in %d lines of %s";
		let n = result.length;

		if (!n) {
			message.reply("No data found!");
			return;
		}

		result.forEach(record => {
			// reorder starting with:
			let newRecord = {
				"Created at": record.created_time,
				"Self guild name": record.self_guild_name,
				"Self player count": record.self_player_cnt,
				"Self score": record.self_score,
				"Score diff": record.score_diff,
				"Opp score": record.opp_score,
				"Opp name": record.opp_name
			};

			// clean up:
			delete record.created_time;
			delete record.self_guild_name;
			delete record.self_player_cnt;
			delete record.self_score;
			delete record.score_diff;
			delete record.opp_score;
			delete record.opp_name;
			delete record.updated_at; // */

			Object.keys(record).forEach((k) => {
				newRecord[k] = record[k];
			});
			record = newRecord;

			if (! ln++) lines.push(Object.keys(record).map(exports.trUnderToSpaces).join(sep)); // headers

			lines.push(Object.values(record).join(sep));
		});
		console.log(logPrefix()+msg, n, lines.length, filename);
		let file_contents = lines.join("\n");

		if (file_contents.trim()==="") {
			message.reply("Generated file contents is empty!");
			return;
		}

		const fs = require("fs");

		fs.writeFile(filename, file_contents, (err) => {
			if (err) {
				console.warn(err);
				message.reply(err);
				return;
			}

			console.log(logPrefix()+'File saved in: %s', filename);

			setTimeout(() => { // Auto clean up:
				fs.unlink(filename, function (err) {
					if (err) {
						console.warn(err);
						return;
					}

					console.log(logPrefix()+'File '+filename+' deleted.');
				});
			}, MINUTES_BEFORE_CLEANUP * 60000); // Converts minutes to ms
			console.log(logPrefix()+'Will clean it up in %d minute(s)...', MINUTES_BEFORE_CLEANUP);

			const basename = filename.replace(/^.*\//, "");

			msg = basename+" contains headers & "+n+" records (total: "+lines.length+" lines)";
			let now = new Date();
			let richMsg = new RichEmbed()
				.setTitle("TW data:").setColor("GREEN")
				.setDescription(msg).attachFile(filename).setTimestamp(now)
				.setFooter(config.footer.message, config.footer.iconUrl);

			message.channel.send(richMsg)
			.catch(exc => {
				let otd = exc.message? exc.message: exc; // object to display

				console.warn(logPrefix()+otd);
				message.reply(otd);
			});
		});
	});
};

/** Store guild territory war results in our database
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 */
exports.territoryWarReg = function(player, message) {
	const table = "tw_results";

	let allycode = player.allycode;
	let logPrefix = exports.logPrefix; // shortcut

	if (!allycode) {
		message.reply(":red_circle: Invalid or missing allycode!");
		return;
	}

	if (message.words.length < 4) {
		let example = "Example: twr 48 20000 19500 Our opponents guild name";
		let usage = "Usage: twr <your player count> <your score> <their score> <their guild name>";

		message.channel.send(":red_circle: "+usage);
		message.channel.send("👉 "+example);

		return;
	}

	let msg = "";
	let self_player_cnt = message.words.shift();
	let self_score = message.words.shift();
	let opp_score = message.words.shift();

	if (!self_player_cnt.match(/^\d{1,2}$/)) {
		msg = "Invalid self player count (not a 2 digits integer)!";
	}
	self_player_cnt = parseInt(self_player_cnt);
	if (self_player_cnt<12 || self_player_cnt>50) {
		msg = "Invalid self player count (not an integer <= 50)!";
	}

	if (!self_score.match(/^\d{1,5}$/)) {
		msg = "Invalid self score!";
	}
	self_score = parseInt(self_score);

	if (!opp_score.match(/^\d{1,5}$/)) {
		msg = "Invalid opponent score!";
	}
	opp_score = parseInt(opp_score);

	if (msg.trim()!=="") {
		console.log(msg);
		message.reply(msg);

		return;
	}

	let sql = "INSERT INTO `"+table+"` (#)\n VALUES (?)";
	let str = x => '"'+x+'"'; // quick function to add double quotes around strings
	let params = {
		"discord_id": str(player.discord_id),
		"allycode": player.allycode,
		"self_guild_id": str(player.guildRefId),
		"self_guild_name": str(player.guildName),
		"self_player_cnt": self_player_cnt,
		"self_score": self_score,
		"opp_score": opp_score,
		"opp_name": str(message.words.join(" "))
	};

	// let color = typeof player.guildName === "undefined"? "ORANGE": "GREEN";
	let lines = [];
	Object.keys(params).forEach(k => {
		lines.push("**"+k.replace(/_/g, " ")+":** "+params[k]);
		console.log(logPrefix()+k+": "+params[k]);
	});

	sql = sql.replace('#', Object.keys( params ).join(", "));
	sql = sql.replace('?', Object.values(params).join(", "));
	console.log(logPrefix()+"SQL: "+sql);

	let values = [Object.values(params)];

	db_pool.query(sql, [values], function(exc, result) {
		/* let richMsg = new RichEmbed()
			.setTitle("TW data to insert:")
			.setDescription(lines).setColor(color)
			.setTimestamp(player.updated)
			.setFooter(config.footer.message, config.footer.iconUrl); // */

		if ( ! exc) {
			let n = result.affectedRows;
			console.log(logPrefix()+"%d record inserted.", n);
			message.channel.send("✅ Saved for guild: "+player.guildName);

			return;
		}

		let err_msg = exc.sqlMessage? exc.sqlMessage: exc; // object to display

		console.log("SQL:", sql);
		console.log(logPrefix()+"RTW Exception:", err_msg);

		message.reply('Failed: '+err_msg);

		return; // ========== stop here for the moment ==========

		/* Retry with an UPDATE:
		sql = "UPDATE `"+table+"`"+ // TODO
			" SET name=?, gp=?, memberCount=?, officerCount=?, gm_allycode=?, ts=?"+
			" WHERE allycode=?";

		db_pool.query(sql, values, function(exc, result) {
			if (exc) {
				color = "RED";
				richMsg.setColor(color);
				err_msg = exc.sqlMessage? exc.sqlMessage: exc; // object to display
				console.log("SQL:", sql);
				console.log(logPrefix()+"RTW Exception:", err_msg);
			} else {
				let n = result.affectedRows;

				color = "GREEN";
				richMsg.setColor(color);
				console.log(logPrefix()+"%d guild records updated (UPDATE).", n);
			}

			message.channel.send(richMsg)
			.then(() => {
				if (color==="GREEN") {
					message.channel.send("✅ Score updated with success for guild: "+player.guildName);
				} else {
					message.reply(":red_circle: Update failed for guild: "+player.guildName);
				}
			})
			.catch(function(ex) {
				console.warn(ex);
				message.reply(ex.message);
				message.channel.send(lines);
			});
		}); // */
	});
};

/** Generate a date string in MySQL format (if no date is given, now is used)
 * @param {Date} d
 * @return {string} simplified date
 */
exports.toMySQLdate = function(d) {
	if (typeof(d)!=="object" || !(d instanceof Date)) {
		d = new Date();
	}

	// d = d.toISOString("en-ZA").replace(/\//g, "-").replace(",", "").substr(0, 19);
	// toLocaleString("en-ZA"):
	//	2020/05/07, 16:13:45

	// Target format example:
	//	2020-05-07 16:13:45
	d = d.toISOString().replace("T", " ").replace(/z$/i, "").replace(/\..*$/, "");

	return d;
};

/** Transform underscores to spaces
 * @param {String} inputStr String with underscores
 * @return {string} String with spaces
 */
exports.trUnderToSpaces = function(inputStr) {
	return inputStr.replace(/_/g, ' ')
};

/** Store a player's data in our database
 * @param {object} player The target player
 * @param {object} message The origin message (request)
 * @param {function} callback The function to call once the job is done here
 */
exports.updatePlayerDataInDb = function(player, message, callback) {
	let allycode = player.allycode;
	let begin = "";
	let logPrefix = exports.logPrefix; // shortcut
	let now = new Date();

	if (!player.name) {
		console.log(logPrefix()+"Invalid player's name for user:", player);
		return;
	}

	// Try to find the same user in the database:
	begin = "Evolution: "+player.name;
	exports.getPlayerFromDatabase(allycode, message, function(prevPlayerVersion) {
		let evols = [];
		let lines = [];
		let msg = "";
		let newEvol = {
			"allycode": allycode,
			"unit_id": "",
			"type": "",
			"new_value": 0,
			"ts": exports.toMySQLdate(now)
		};

		// If the user was unknown, do no look for any evolution:
		if (prevPlayerVersion && prevPlayerVersion.gp) {
			// Check for evolutions:
			let newUnitCount = 0;
			let giftCount = prevPlayerVersion.giftCount;
			let nbChars = 0;
			let nbShips = 0;
			let prevUnitsCount = prevPlayerVersion.unitsData.length;

			console.log(logPrefix()+"Previous unit count:", prevUnitsCount);

			// Look for new gifts:
			if (giftCount && giftCount<player.giftCount) {
				newEvol.type = "newGifts";
				newEvol.new_value = player.giftCount - giftCount;
				evols.push(exports.clone(newEvol));
				msg = begin + " did "+newEvol.new_value+" new gift(s)";
				console.log(logPrefix()+msg);
			}

			player.unitsData.forEach(function(u) {
				let prevUnit = prevPlayerVersion.unitsData[u.name];

				if (u.combatType===1)
					++nbChars;
				else
					++nbShips;

				newEvol.unit_id = u.name;
				// Compare old & new units...

				// Look for new units:
				if (typeof(prevUnit)==="undefined") {
					if (prevUnitsCount) { // New unit:
						newEvol.new_value = 1;
						newEvol.type = "new";
						evols.push(exports.clone(newEvol));

						msg = begin + " unlocked "+u.name;
						console.log(logPrefix()+msg);
						++newUnitCount;
					}

					return;
				}

				// Look for new relics:
				if (u.relic>2 && u.relic>prevUnit.relic) {
					newEvol.new_value = u.relic;
					newEvol.type = "relic";
					evols.push(exports.clone(newEvol));

					msg = begin+"'s "+u.name+" is now R"+u.relic;
					console.log(logPrefix()+msg);
				} else
				// Look for new gears:
				if (u.gear>11 && u.gear>prevUnit.gear) {
					newEvol.new_value = u.gear;
					newEvol.type = "gear";
					evols.push(exports.clone(newEvol));

					msg = begin+"'s "+u.name+" is now G"+u.gear;
					console.log(logPrefix()+msg);
				}

				// Look for new stars:
				if (prevUnit.stars>0 && u.stars>6 && u.stars>prevUnit.stars) {
					newEvol.new_value = u.stars;
					newEvol.type = "star";
					evols.push(exports.clone(newEvol));

					msg = begin+"'s "+u.name+" is now "+u.stars+"*";
					console.log(logPrefix()+msg);
				}

				// Look for new zetas:
				if (u.zetaCount>prevUnit.zetaCount) {
					newEvol.new_value = u.zetaCount;
					newEvol.type = "zeta";
					evols.push(exports.clone(newEvol));

					msg = begin+"'s "+u.name+" has now "+u.zetaCount+" zeta(s)";
					console.log(logPrefix()+msg);
				}
			}); // end of unit loop
			console.log(logPrefix()+"Characters count: "+nbChars);

			evols.forEach(function(newEvol) {
				lines.push(Object.values(newEvol));
			});

			if (newUnitCount) {
				msg = "There is %d new unit(s) in %s's roster.";
				console.log(logPrefix()+msg, newUnitCount, player.name);
			}
			console.log(logPrefix()+"%s owns %d ships", player.name, nbShips);

			msg = lines.length+" new evolution(s) detected for: "+player.name;
			console.log(logPrefix()+msg);
			if (message && lines.length) message.channel.send(msg);

			if (lines.length) {
				let sql1 = "INSERT INTO `evols` (allycode, unit_id, type, new_value, ts) VALUES ?";
				db_pool.query(sql1, [lines], function(exc, result) {
					if (exc) {
						console.log("SQL1:", sql1);
						console.warn(logPrefix()+"UC Exception:", exc.sqlMessage? exc.sqlMessage: exc);
						if (message) message.reply("Failed to save evolution(s)!");
						return;
					}

					console.log(logPrefix()+"%d evolution(s) inserted.", result.affectedRows);
					if (message) view.showLastEvols(player, message, evols);
				});
			}
		}

		// Remember user's stats:
		let update = new Date(player.updated);

		update = exports.toMySQLdate(update);
		console.log(logPrefix()+'Data updated at: %s', update);

		let sql2 = "UPDATE users SET"+
			" game_name="+mysql.escape(player.name)+","+
			" giftCount="+player.giftCount+","+
			" gp="+player.gp+","+
			" g12Count="+player.g12Count+","+
			" g13Count="+player.g13Count+","+
			" guildRefId="+mysql.escape(player.guildRefId)+","+
			" zetaCount="+player.zetaCount+","+
			" ts="+mysql.escape(update)+" "+
			"WHERE allycode="+allycode;

		db_pool.query(sql2, function(exc, result) {
			if (exc) {
				console.log("SQL2:", sql2);
				console.log(logPrefix()+"UC Exception:", exc.sqlMessage? exc.sqlMessage: exc);
				return;
			}

			console.log(logPrefix()+"%d user updated:", result.affectedRows, player.name);

			if (!result.affectedRows) {
				let sql3 = "INSERT INTO `users`\n"+
					"(allycode, game_name, gp, g12Count, g13Count, guildRefId, zetaCount)\n"+
					"VALUES ("+allycode+", "+mysql.escape(player.name)+
					", "+player.gp+", "+player.g12Count+", "+player.g13Count+
					", "+mysql.escape(player.guildRefId)+", "+player.zetaCount+")";

				db_pool.query(sql3, function(exc, result) {
					if (exc) {
						console.log("SQL3:", sql3);
						console.log(logPrefix()+"GC Exception:", exc.sqlMessage? exc.sqlMessage: exc);
						return;
					}

					console.log(logPrefix()+"%d user inserted:", result.affectedRows, player.name);
				});
			}
		});

		if (player.unitsData && player.unitsData.length) {
			let lines = [];

			// See:
			// https://www.w3schools.com/nodejs/shownodejs_cmd.asp?filename=demo_db_insert_multiple
			let sql4 = "REPLACE `units` (allycode, name, combatType, gear, gp, relic, stars, zetaCount) VALUES ?";

			player.unitsData.forEach(function(u) { // u = current unit
				if (!u.stars) {
					console.warn(logPrefix()+"Invalid star count for unit:\n ", JSON.stringify(u));
				}
				lines.push(
					[u.allycode, u.name, u.combatType, u.gear, u.gp, u.relic, u.stars, u.zetaCount]
				);
			}); // end of unit loop

			db_pool.query(sql4, [lines], function(exc, result) {
				if (exc) {
					console.log("SQL4:", sql4);
					console.log(logPrefix()+"RU Exception:", exc.sqlMessage? exc.sqlMessage: exc);
					return;
				}

				let nbr = result.affectedRows; // shortcut for number of records
				console.log(logPrefix()+"%d unit records updated (%d fresh units).", nbr, lines.length);

				if (typeof(callback)==="function") callback(player, message);
			});
		} else	if (typeof(callback)==="function") callback(player, message);

		let sql5 = "UPDATE `tw_results` SET self_guild_id=?, self_guild_name=?"+
			" WHERE allycode=? AND (self_guild_name='null' OR self_guild_name IS NULL)";

		lines = [player.guildRefId, player.guildName, allycode];
		db_pool.query(sql5, lines, function(exc, result) {
			if (exc) {
				console.log("SQL5:", sql5);
				console.log(logPrefix()+"UTWR Exception:", exc.sqlMessage? exc.sqlMessage: exc);
				console.log("Lines:", JSON.stringify(lines));
				return;
			}

			let nbr = result.affectedRows; // shortcut for number of records
			console.log(logPrefix()+"%d TW results updated.", nbr);
		});
	});
};

// vim: noexpandtab shiftwidth=4 softtabstop=4 tabstop=4
