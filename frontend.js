const wslink = window.location.protocol === 'file:' ? "localhost:18080/" : "death-and-taxes.onrender.com/";
const url = window.location.protocol === 'file:' ? "http://" + wslink: "https://" + wslink;


let playerId, token = "abcdef", alive = {}, lobby, dayNum, knownRoles = {};
let playerList, timer, phase, coins = 0;
let username = "";
let ws;

const lengths = {
	"Day": 5,
	"Voting": 30,
	"Night": 30,
}

const factionClasses = {
	"Town": "town-role",
	"Mafia": "mafia-role",
	"Killer": "nk-role",
	"Outcast": "outcast-role",
	"Neutral": "neutral-role",
	"Mayor": "mayor-role",
}

function ability(name = "Ability", time = "Night", func = 0, params = [], target = "alive", limit = -1, cost = 0, id = 0) {
	this.name = name;
	this.time = time;
	this.limit = limit;
	this.cooldown = 0;
	this.cost = cost;
	this.target = target;
	this.func = func;
	this.params = params;
	this.currTarg = -1;
	this.id = 0;
}

const tagColors = {
	green: "#008800",
	red: "#ff0000",
	yellow: "#ffff00",
	blue: "#15b8ff",
	purple: "#8000b0",
};

function colorize(message) {
	for (const tag in tagColors) {
		if (message.startsWith(`[${tag}]`)) {
			return `<span style="color:${tagColors[tag]};">${message.slice(tag.length + 2)}</span>`;
		}
	}
	return message;
}


const roles = {
	"Gunner" : {
		"type" : "Power",
		"desc" : `
			[D|c4] Buy - Gain 1 charge of Shoot.<br>
			[N|1] Shoot - Kill a player.<br>
			Parliament ability:<br>
			[P] Negotiate - The cost of Buy drops by 1.<br>
		`
	},
	"Sheriff" : {
		"type" : "Inspection",
		"desc" : `
			[N|c1] Interrogate - Determine if a player is non-Town and has allies.<br>
			Parliament ability:<br>
			[N|2|c4] Expert investigation - Determine a player's exact role.<br>
		`
	},
	"Coroner" : {
		"type" : "Scout",
		"desc" : `
			[N|c1] Autopsy - Determine a dead player's role and their killer's role.<br>
			Parliament ability:<br>
			[N|2|c4] Search - Determine 1 of 2 players killed a target player.`
	},
	"Investigator" : {
		"type" : "Investigative",
		"desc" : `
			[N|c1] Investigate - Get a clue to a player's role.<br>
			Parliament ability:<br>
			[N|2|c2] Deduce - Determine a player's exact role type.
			`
	},
	"Doctor" : {
		"type" : "Protective",
		"desc" : `
			[P] Bonus - You start with 2 coins.<br>
			[N|c2] Heal - Heal a player. If they were attacked, gain 3 coins.<br>
			Parliament ability:<br>
			[N|2|c5] Immunize - Render a player invulnerable until they are attacked again or you die.
`
	},
	"Vigilante" : {
		"type" : "Killing",
		"desc" : `
			[N|c5] Shoot - Kill a player if they oppose you.<br>
			Parliament ability:<br>
			[N|1] Reveal - Determine a player's alignment.
`
	},
	"Merchant" : {
		"type" : "Economic",
		"desc" : `
			[P] Trade - Your salary is 2 coins instead of 1.<br>
			[N|c3] Invest - Raise your income by 1.<br>
			Parliament ability:<br>
			[N|2|c3] Educate - Raise another player's income by 1.
`
	},
	"Deputy" : {
		"type" : "Support",
		"desc" : `
			[P] Trained - When a Town Enforcer dies, you become their role.<br>
			Parliament ability:<br>
			[P] Insight - Learn the names of all Town Enforcers.`
	},
	"Godfather" : {
		"type" : "Power",
		"desc" : `
			[P] Immune - You cannot die at night.<br>
			[P] Rich - All Mafia members start with 5 coins instead of 3.<br>
			Parliament ability:<br>
			[N|1] Tyrant - Win.
`
	},
	"Jackal" : {
		"type" : "Killing",
		"desc" : `
			[N|2|c7] Assassinate - Kill a player astrally, bypassing protection.<br>
			Parliament ability:<br>
			[P] Special Skills - Your income increases by 1.
			`
	},
	"Framer" : {
		"type" : "Deception",
		"desc" : `
			[N|c1] Frame - Frame a player. Any Town role that gets information off of them will instead get information off of you.<br>
			Parliament ability:<br>
			[N|c4] Manipulate - Make everybody register as a different player tonight.
`
	},
	"Consigliere" : {
		"type" : "Support",
		"desc" : `
			[P] Open Ears - You can read whispers.<br>
			[N|c1] Investigate - Determine a player's role. Until the game ends, you will also learn who they visit and who visits them.<br>
			Parliament ability:<br>
			[N|c2] Lock - Disable a player from spending, giving, or receiving coins tonight, including from their regular income.
			`
	},
	"Sniper" : {
		"type" : "Support",
		"desc" : `
			[N|2|c3] Snipe - If used when you are the Soldier, your kill is astral and bypasses protection.<br>
			Parliament ability:<br>
			[N] Fine - Take 5 coins from another player.
			`
	},
	"Serial Killer" : {
		"type" : "Killing",
		"desc" : `
			[P] Immune - You can't die at night.<br>
			[P] Bonus - You start with 4 coins.<br>
			[N*] Stab - Kill a player, stealing all of their money.<br>
			[N*|c5] Assassinate - Make Stab astral and bypass protection.<br>
			[N*|c8] Bloodlust - Kill a second player (without taking their money).<br>
			Parliament ability:<br>
			[N*|c6] Rampage - Make Stab attack a player's visitors (without taking their money).
			`
	},
	"Amnesiac" : {
		"type" : "Support",
		"desc" : `
			[P] Contempt - If a Neutral (Killing) dies and no more of them live, become that role.<br>
			[P] Open Ears - You can read whispers.<br>
			[P] Account - Each night, learn how many coins were spent in total, as well as everyone's incomes.<br>
			[N|c1] Investigate - Determine a player's role. Until the game ends, you will also learn who they visit and who visits them.<br>
			Parliament ability:<br>
			[N|c2] Lock - Disable a player from spending, giving, or receiving coins tonight, including from their regular income.
			`
	},
	
}

function showPage(pageId) {
	document.querySelectorAll(".page").forEach(page => {
		page.style.display = "none";
	});

	document.getElementById(pageId).style.display = "flex";
}

let factions, rolelists, buckets, sort, goals, colours;
async function load() {
	factions = {
        "Town": [
            "Gunner",
            "Jailor",
            "Transporter",
            "Marshal",

            "Sheriff",
            "Seer",
            "Psychic",
            "Bard",
            
            "Town Inspection",
            "Town Power",
            "Town Enforcer",

            "Coroner",
            "Hacker",
            "Accountant",
            "Spy",

            "Investigator",
            "Tracker",
            "Auditor",
            "Gambler",

            "Doctor",
            "Watcher",
            "Locksmith",
            "Trapper",

            "Vigilante",
            "Flagger",
            "Agent",
            "Cupid",

            "Merchant",
            "Pickpocket",
            "Trainer",
            "Investor",

            "Bartender",
            "Deputy",
            "Scholar",
            "Trickster",

            "Town Scout",
            "Town Investigative",
            "Town Protective",
            "Town Killing",
            "Town Economic",
            "Town Support",
            "Common Town",

            "Townie"
        ],
        "Mafia": [
            "Godfather",
            "Propagandist",
            "Mastermind",
            "Bomber",

            "Jackal",
            "Barbarian",
            "Conspirator",
            "Kidnapper",

            "Mafia Power",
            "Mafia Killing",
            "Salient Mafia",

            "Forger",
            "Robber",
            "Ambusher",
            "Launderer",

            "Framer",
            "Phasmologist",
            "Disguiser",
            "Rigger",

            "Bootlegger",
            "Consigliere",
            "Insider",
            "Sniper",

            "Mafia Economic",
            "Mafia Support",
            "Mafia Deception",
            "Common Mafia",

            "Mafioso"
        ],
        "Killer": [
            "Serial Killer",
            "Reaper",
            "Lost Soul",
            "Fallen Angel",

            "Amnesiac",
            "Hex Master",
            "Tactician",
            "Ritualist",
            "Neutral Killing",
            "Neutral Support"
        ],
        "Outcast" : [
            "Carnifex",
            "Neutral Outcast"
        ],
        "Neutral": [
            "Entrepeneur",
            "Anarchist",
            "Corrupt",
            "Beamer",

            "Executioner",
            "Inquisitor",
            "Devout",
            "Politician",

            "Neutral Economic",
            "Neutral Solo",
            "Common Neutral"
        ]
    };
	rolelists = {}
	rolelists["Mafia's Invitation"] = {
		desc : "The Mafia invites you. Shall you take their challenge? <br> This gamemode is suited for beginners; only 16 roles can spawn here, which is about a fifth of the base game content.",
            rolelist : [
                ["Sheriff"],
                ["Deputy"],
                ["Coroner", "Investigator"],
                ["Common Town"],
                ["Common Town"],
                ["Godfather"],
                ["Common Mafia"],
                ["Doctor", "Vigilante"],
                ["Jackal"],
                ["Gunner"],
                ["Serial Killer"],
                ["Merchant"],
                ["Amnesiac"],
                ["Common Town"],
                ["Common Mafia"],
                ["Common Town"]
            ],
            "whitelist" : [
                "Gunner",
                "Sheriff",
                "Coroner",
                "Investigator",
                "Doctor",
                "Merchant",
                "Vigilante",
                "Deputy",
                "Godfather",
                "Jackal",
                "Framer",
                "Consigliere",
                "Bootlegger",
                "Sniper",
                "Serial Killer",
                "Amnesiac"
            ]
	}
	rolelists["Ranked"] = {
		desc : "This is a competitive game. Play hard to win exclusive rewards! <br>Note that there are several variations of the Ranked list, and it's up to you to figure out which one is in play.",
		"rolelist" : [
			["Sheriff"],
			["Deputy"],
			["Coroner", "Investigator"],
			["Common Town"],
			["Common Town"],
			["Godfather"],
			["Common Mafia"],
			["Doctor", "Vigilante"],
			["Jackal"],
			["Gunner"],
			["Serial Killer"],
			["Merchant"],
			["Amnesiac"],
			["Common Town"],
			["Common Mafia"],
			["Common Town"]
		]
	}
	buckets = {
        "Town Power" : [
            "Gunner",
            "Jailor",
            "Transporter",
            "Marshal"
        ],
        "Town Inspection" : [
            "Sheriff",
            "Seer",
            "Psychic",
            "Bard"
        ],
        "Town Enforcer" : [
            "Town Inspection",
            "Town Power"
        ],
        "Town Scout" : [
            "Coroner",
            "Hacker",
            "Accountant",
            "Spy"
        ],
        "Town Investigative" : [
            "Investigator",
            "Tracker",
            "Auditor",
            "Gambler"
        ],
        "Town Protective" : [
            "Doctor",
            "Watcher",
            "Locksmith",
            "Trapper"
        ],
        "Town Killing" : [
            "Vigilante",
            "Flagger",
            "Agent",
            "Cupid"
        ],
        "Town Economic" : [
            "Merchant",
            "Pickpocket",
            "Trainer",
            "Investor"
        ],
        "Town Support" : [
            "Bartender",
            "Deputy",
            "Scholar",
            "Trickster"
        ],
        "Common Town" : [
            "Town Scout",
            "Town Investigative",
            "Town Protective",
            "Town Killing",
            "Town Economic",
            "Town Support"
        ],
		"Mafia Power": [
			"Godfather",
			"Propagandist",
			"Mastermind",
			"Bomber",
		],
		"Mafia Killing": [
			"Jackal",
			"Barbarian",
			"Conspirator",
			"Kidnapper",
		],
		"Salient Mafia" : [
			"Mafia Power",
			"Mafia Killing",
		],
		"Mafia Economic" : [
			"Forger",
			"Robber",
			"Ambusher",
			"Launderer",
		],
		"Mafia Deception" : [
			"Framer",
			"Phasmologist",
			"Disguiser",
			"Rigger",
		],
		"Mafia Support" : [
			"Bootlegger",
			"Consigliere",
			"Insider",
			"Sniper",
		],
		"Common Mafia" : [
			"Mafia Economic",
			"Mafia Support",
			"Mafia Deception",
		],
		"Neutral Killing" : [
			"Serial Killer",
			"Reaper",
			"Lost Soul",
			"Fallen Angel",
		],
		"Neutral Support" : [
			"Amnesiac",
			"Hex Master",
			"Tactician",
			"Ritualist",
		],
		"Neutral Outcast" : [
			"Carnifex",
			"Scammer",
			"Beguiler",
			"Thief",
		],
		"Neutral Economic" : [
			"Entrepeneur",
			"Anarchist",
			"Corrupt",
			"Beamer",
		],
		"Neutral Solo" : [
			"Executioner",
			"Inquisitor",
			"Devout",
			"Politician",
		],			
		"Common Neutral" : [
			"Neutral Economic",
			"Neutral Solo",
		]
			
			
		
    }
	sort = [
        "Gunner",
        "Jailor",
        "Transporter",
        "Marshal",

        "Sheriff",
        "Seer",
        "Psychic",
        "Bard",

        "Town Inspection",
        "Town Power",
        "Town Enforcer",

        "Coroner",
        "Hacker",
        "Accountant",
        "Spy",

        "Investigator",
        "Tracker",
        "Auditor",
        "Gambler",

        "Doctor",
        "Watcher",
        "Locksmith",
        "Trapper",

        "Vigilante",
        "Flagger",
        "Agent",
        "Cupid",

        "Merchant",
        "Pickpocket",
        "Trainer",
        "Investor",

        "Bartender",
        "Deputy",
        "Scholar",
        "Trickster",

        "Town Scout",
        "Town Investigative",
        "Town Protective",
        "Town Killing",
        "Town Economic",
        "Town Support",
        "Common Town",

        "Godfather",
        "Propagandist",
        "Mastermind",
        "Bomber",

        "Jackal",
        "Barbarian",
        "Conspirator",
        "Kidnapper",

        "Mafia Power",
        "Mafia Killing",
        "Salient Mafia",

        "Forger",
        "Robber",
        "Ambusher",
        "Launderer",

        "Framer",
        "Phasmologist",
        "Disguiser",
        "Rigger",

        "Bootlegger",
        "Consigliere",
        "Insider",
        "Sniper",

        "Mafia Economic",
        "Mafia Support",
        "Mafia Deception",
        "Common Mafia",

        "Serial Killer",
        "Reaper",
        "Lost Soul",
        "Fallen Angel",

        "Amnesiac",
        "Hex Master",
        "Tactician",
        "Ritualist",

        "Neutral Killing",
        "Neutral Support",

        "Carnifex",
        "Neutral Outcast",

        "Entrepeneur",
        "Anarchist",
        "Corrupt",
        "Beamer",

        
        "Executioner",
        "Inquisitor",
        "Devout",
        "Politician",
        
        "Neutral Economic",
        "Neutral Solo",
        "Common Neutral"
    ]
	goals = {
		"Town" : "Kill anyone with ill-intent to the peace.",
        "Mafia" : "Kill anyone who dare stand in the Mafia's way.",
        "Killer" : "Kill them all. They deserve to die.",
        "Outcast" : "See to the Town's demise.",
        "Neutral" : "Do what you must to complete your objective."
	};
	colours = {
        "Town" : "#00a914",
        "Mafia" : "#c91134",
        "Killer" : "#1242e9",
        "Outcast" : "#ff0088",
        "Neutral" : "#888888"
    }
}

async function flattenBuckets() {
	let nb = {};
	for (var key of Object.keys(buckets)) {
		nb[key] = [];
		let bucket = buckets[key];
		for (let i = 0; i < bucket.length; ++i) {
			if (buckets[bucket[i]] != null) {
				buckets[bucket[i]].forEach(role => {
					nb[key].push(role);
				})
			} else {
				nb[key].push(bucket[i]);
			}
		}
		buckets[key] = nb[key];
	}
}

load().then(() => {flattenBuckets()});
function showCard(role, id) {
	let card = document.getElementById(id);
	let faction = checkFaction(role);
	card.querySelector("h3").innerHTML = span(colours[faction]) + role + "</span>";
	let factiont = faction == "Killer" || faction == "Outcast" ? "Neutral" : faction;
	card.querySelector("h4").innerHTML = span(colours[faction]) + factiont + " (" + span("#25b8f1") + roles[role].type + "</span>)</span>";
	let obj = roles[role];
	let desc;
	if (obj != null) {
		desc = roles[role].desc;
	}
	if (desc == null) {
		desc = "Role description missing, tell Cyanberry to fix it."
	}
	card.querySelector("p").innerHTML = desc;
}

function checkFaction(role) {
	let currf = "None";
	for (let [faction, roles] of Object.entries(factions)) {
		roles.forEach(rol => {
			if (role == rol) {
				currf = faction;
			}
		})
	}
	return currf;
}

function filterWhitelist(id, string) {
	let poss = string.split('/');
	let full = [];
	poss.forEach(role => {
		if (buckets[role] === undefined) {
			full.push(role);
		} else {
			buckets[role].forEach(r => {
				full.push(r);
			})
		}
	});
	console.log(full);
	let wl = document.getElementById(id);
	Array.from(wl.children).forEach(button => {
		if (full.includes(button.value)) {
			button.classList.remove("disabled-role");
		} else {
			button.classList.add("disabled-role");
		}
	})
}

function span(colour) {
	return `<span style="color: ${colour};">`;
}

function stripHTML(htmlString) {
	const tempDiv = document.createElement("div");
	tempDiv.innerHTML = htmlString;
	return tempDiv.textContent || tempDiv.innerText || "";
}

let selList = "";
function showList(listName) {
	selList = listName;
	document.getElementById("list-parent").innerHTML = "Rolelist<br>";
	document.getElementById("role-whitelist").innerHTML = "Whitelist<br>";
	let desc = rolelists[listName].desc;
	document.getElementById("list-name").innerHTML = listName;
	document.getElementById("list-desc").innerHTML = desc;
	let list = rolelists[listName].rolelist;
	let whitelist = rolelists[listName].whitelist;
	if (whitelist == null) {
		whitelist = [];
		sort.forEach(role => {
			if (buckets[role] == null) {
				whitelist.push(role);
			}
		});
		if (rolelists[listName].blacklist != null) {
			rolelists[listName].blacklist.forEach(role => {
				let id = whitelist.indexOf(role);
				if (id !== -1) whitelist.splice(id, 1);
			})
		}
	}
	whitelist.push("Mayor");
	for (let i = 0; i < list.length; ++i) {
		let disp = "";
		list[i].forEach(role => {
			let currf = "None";
			for (let [faction, roles] of Object.entries(factions)) {
				roles.forEach(rol => {
					if (role == rol) {
						currf = faction;
					}
				})
			}
			if (currf == "None") {
				// document.getElementById("list-desc").innerHTML = "CYAN YOUR THING BROKE";
			} else {
				disp += "<span style=\"color: " + colours[currf] + ";\">" + role + "/";
			}
		})
		if (disp.endsWith("/")) {
			disp = disp.slice(0, -1);
		}

		let element = document.createElement("button");
		element.innerHTML = disp;
		element.classList.add("rolelist");
		element.addEventListener("click", () => {
			filterWhitelist("role-whitelist", stripHTML(disp));
		});
		document.getElementById("list-parent").appendChild(element);
	}
	whitelist.forEach(role => {
		let currf = checkFaction(role);
		let classT = "#000000";
		if (currf == "None") {
			classT = "mayor-role";
		} else {
			classT = factionClasses[currf]
		}
		document.getElementById("role-whitelist").innerHTML += `<input type="button" 
           value="${role}" 
           class="${classT}" 
           onclick="showCard('${role}', 'lobby-card')">`;
	})
}

function sortRolelist(list) {
	return [...list].sort((a, b) => {
		const getMinIndex = arr => {
			const indices = arr
				.map(r => sort.indexOf(r))
				.filter(i => i !== -1);
			return indices.length ? Math.min(...indices) : 9999;
		};
		return getMinIndex(a) - getMinIndex(b);
	});
}

function gameList(rolelist, whitelist) {
	whitelist.push("Mayor");
	rolelist = sortRolelist(rolelist);
	document.getElementById("game-rolelist").innerHTML = "";
	document.getElementById("game-whitelist").innerHTML = "";
	for (let i = 0; i < rolelist.length; ++i) {
		let disp = "";
		rolelist[i].forEach(role => {
			let currf = checkFaction(role);
			if (currf == "None") {
				// document.getElementById("list-desc").innerHTML = "CYAN YOUR THING BROKE";
			} else {
				disp += span(colours[currf]) + role + "/";
			}
		})
		if (disp.endsWith("/")) {
			disp = disp.slice(0, -1);
		}
		let element = document.createElement("button");
		element.innerHTML = disp;
		element.classList.add("rolelist");
		element.addEventListener("click", () => {
			filterWhitelist("game-whitelist", stripHTML(disp));
		});
		document.getElementById("game-rolelist").appendChild(element);
	}
	whitelist.forEach(role => {
		let currf = checkFaction(role);
		let classT = "#000000";
		if (currf == "None") {
			classT = "mayor-role";
		} else {
			classT = factionClasses[currf];
		}
		document.getElementById("game-whitelist").innerHTML += `<input type="button" 
           value="${role}" 
           class="${classT}" 
           onclick="showCard('${role}', 'ref-card')">`;
	})
}

function appendMessage(playerId, message) {
	const chatElem = document.getElementById("chat-content");
	chatElem.innerHTML += `${playerId}: ${message}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPhaseTimer() {
    while (lobby != "-") {
        --timer;
        await sleep(1000);
        document.getElementById("phase-timer").innerHTML = phase + ": " + timer.toString();
    }
}

function updatePlayerList() {
	let list = document.getElementById("player-list-parent");
	list.innerHTML = "";
	for (let i = 0; i < playerList.length; ++i) {
		let p = playerList[i];
		if (alive[p] == null || alive[p] == true) {
			list.innerHTML += `${i+1} ${p}`;
		} else {
			list.innerHTML += `<span style=\"color: #aa0000;\">${i+1} ${p} </span>`;
		}
		if (knownRoles[p] != null) {
			let role = knownRoles[p];
			if (typeof role === "string") {
				let faction = checkFaction(role);
				let color = colours[faction] || "#888888";

				list.innerHTML += ` (<span style="color: ${color};">${role}</span>)`;
			} else {
				console.warn(`Invalid role for ${p}:`, role);
			}
		}
		if (p == username) {
			list.innerHTML += ` (<span style="color: #f3c941;">You</span>)`;
		}
		list.innerHTML += "<br>";
	}
}

function auth() {
	fetch(url + "auth", {
		method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ 
				player_id: username 
			})
		})
		.then(res => res.text())
		.then(data => {
			token = data;
			let link = window.location.protocol === 'file:' ? "ws://" + wslink + "listen" : "wss://" + wslink + "listen";
			ws = new WebSocket(link);
			ws.onopen = () => {
				ws.send(JSON.stringify({ type: "auth", token: token, id: username })); //aint firing
			};

			 ws.onmessage = (event) => {
				
				const data = JSON.parse(event.data);
				if (data.type == "Chat") {
					let chat = "";
					data["content"].forEach(({ playerId, username, message }) => {
						message = colorize(message);
						if (playerId == 0) {
							chat += `${message} <br>`; //seems to throw
						} else {
							chat += `[${playerId}] ${username}: ${message}<br>`;
						}
						
					});
					document.getElementById("chat-content").innerHTML = chat;
				} else if (data.type == "ShowAbility") {
					const {
						name = "Unknown",
						cost = "??",
						cooldown = 0,
						charges = "??",
						target,
						id
					} = data;
					let ab = document.createElement("div");
					ab.classList.add("ability-box");
					if (cooldown > 0 || charges == 0 || coins < cost) ab.classList.add("neutral-role");
					document.getElementById("abilities").appendChild(ab);
					let abTitle = document.createElement("h3");
					abTitle.innerHTML = name;
					ab.appendChild(abTitle);
					let info = document.createElement("p");
					if (cost > 0) {
						info.innerHTML = "Cost: " + cost + "c";
					}
					if (charges >= 0) {
						info.innerHTML += "<br>Charges: " + charges + " left."
					}
					if (cooldown > 0) {
						info.innerHTML += "<br> On Cooldown.";
					}
					ab.appendChild(info);
					let form = document.createElement("form");
					form.classList.add("right");
					ab.appendChild(form);
					ab.setAttribute("data-id", id);
					form.addEventListener("submit", function(event) {
						event.preventDefault();
					});	
					target.forEach(targetType => {
						let obj;
						
						if (targetType == "number") {
							obj = document.createElement("input");
							obj.type = "number";
						} else if (targetType == "alive") {
							obj = document.createElement("select");
							for (let i = -1; i < playerList.length; ++i) {
								let nunc = document.createElement("option");
								if (i == -1) nunc.value = `-1 None`;
								else nunc.value = `${i+1} ${playerList[i]}`;
								nunc.innerHTML = nunc.value;
								obj.appendChild(nunc);
							}
						} else if (targetType == "check") {
							obj = document.createElement("input");
							obj.type = "checkbox";
						}
						form.appendChild(obj);
					})
					form.addEventListener("change", function () {
						const targ = [];
						for (let obj of form.children) {
							if (obj instanceof HTMLInputElement || obj instanceof HTMLSelectElement) {
								if (obj.type === "checkbox") {
									if (obj.checked) {
										targ.push(1);
									} else {
										targ.push(-1);
									}
								} else {
									targ.push(obj.value.split(" ")[0]);
								}
								
							}
						}
						const j = {
							type: "ability",
							id: id,
							p_id: username,
							targ: targ
						};

						ws.send(JSON.stringify(j));
					});
				} else if (data.type == "ClearAbs") {
					document.getElementById("abilities").innerHTML = "";
				} else if (data.type == "ChangeState") {
					phase = data["state"];
					dayNum = data["dayNum"];
					if (phase == "Day") timer = lengths["Day"] * playerList.length;
					else timer = lengths[phase];
					const background = document.getElementById("body");
					background.classList.remove("bg-night", "bg-day");
					background.classList.add(phase === "Night" ? "bg-night" : "bg-day");
				} else if (data.type == "ShowRole") {
					showCard(data.role, "show-card");
					alert("You are a " + data.role + ".");
					if (data.ingame !== true) {
						startPhaseTimer();
						playerList.forEach(p => {
							alive[p] = true;
						});
					}
					knownRoles[username] = data.role;
					updatePlayerList();
				} else if (data.type == "PlayerList") {
					playerList = data["player-list"];
					updatePlayerList();
				} else if (data.type == "UpdateCoins") {
					coins = data.coins;
					document.getElementById("coin-count").innerHTML = "Coins: " + data.coins;
				} else if (data.type == "Kill") {
					alive[data.victim] = false;
					updatePlayerList();
				} else if (data.type == "RoleReveal") {
					knownRoles[data.player] = data.role;
					updatePlayerList();
				} else if (data.type == "Rolelist") {
					gameList(data.rolelist, data.whitelist);
				}
				
			};
	})
}

function join() {
	fetch(url + "join/" + encodeURIComponent(selList), {
		method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ 
				id: username,
				authToken: token
			})
		}).then(data => {
			return data.text();
		}).then(ret => {
			if (ret == "Join Successful!") {
				showPage("game-screen");
			} else {
				alert(ret);
			}
		});
	}

document.getElementById("login").addEventListener("submit", function(event) {
	event.preventDefault();
	username = document.getElementById("username").value;
	showPage("mode-select");
	auth();
});

function send(msg) {
	if (ws.readyState == WebSocket.OPEN) {
		ws.send(JSON.stringify({
			type: "chat",
			msg: msg,
			id: username,
		}));
	}
}

function sendAb(id, targ) {
	if (ws.readyState == WebSocket.OPEN) {
		ws.send(JSON.stringify({
			type: "chat",
			id: id,
			targ: targ,
			p_id: username,
		}));
	}
}

document.getElementById("send-msg").addEventListener("submit", function(event) {
	event.preventDefault();
	send(document.getElementById("typebox").value);	
	document.getElementById("typebox").value = "";
});



