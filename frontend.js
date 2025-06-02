const wslink = "death-and-taxes.onrender.com/";
const url = "https://" + wslink;


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
	"Killer": "killer-role",
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
	yellow: "#ffff00"
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
			Parliament ability:.<br>
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
			[N|c1] Autopsy - Determine a dead player's role and their killer's role.
			Parliament ability:
			[N|2|c4] Search - Determine 1 of 2 players killed a target player.
		`
	}
}

function showPage(pageId) {
	document.querySelectorAll(".page").forEach(page => {
		page.style.display = "none";
	});

	document.getElementById(pageId).style.display = "flex";
}

let factions, rolelists, buckets, sort, goals, colours;
async function load() {
	fetch('data.json')
		.then(response => response.json())
		.then(data => {
			factions = data.factions;
			rolelists = data.rolelists;
			buckets = data.buckets;
			sort = data.sort;
			goals = data.goals;
			colours = data.colours;
		});
}

async function flattenBuckets() {
	buckets.forEach(bucket => {
		let remLocs = [];
		for (let i = 0; i < bucket.length; ++i) {
			if (buckets[bucket[i]] != null) {
				remLocs.push(i);
				buckets[bucket[i]].forEach(role => {
					bucket.push(role);
				});
			}
		}
		remLocs.reverse();
		remLocs.forEach(id => {
			bucket.splice(id, 1);
		})
	})
}

load().then(() => {flattenBuckets()});
function showCard(role, id) {
	let card = document.getElementById(id);
	card.querySelector("h3").innerHTML = role;
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
		let poss = [];
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
				// disp += role + "/";
			}
		})
		disp = disp.slice(0, -1);
		disp += "<br>";
		document.getElementById("list-parent").innerHTML += disp;
		// document.getElementById("list-parent").innerHTML += "<input class=\"rolelist-button\" type=\"button\" value=\"" + disp + "\">";
	}
	whitelist.forEach(role => {
		let currf = checkFaction(role);
		let classT = "#000000";
		if (currf == "None") {
			classT = "mayor-role";
		} else {
			switch(currf) {
				case "Town":
					classT = "town-role";
					break;
				case "Mafia":
					classT = "mafia-role";
					break;
				case "Killer":
					classT = "nk-role";
					break;
				case "Outcast":
					classT = "outcast-role";
					break;
				default:
					classT = "neutral-role";
					break;
			}
			// disp += role + "/";
		}
		document.getElementById("role-whitelist").innerHTML += `<input type="button" 
           value="${role}" 
           class="${classT}" 
           onclick="showCard('${role}', 'lobby-card')">`;
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
		console.log(p);
		if (alive[p] == null || alive[p] == true) {
			list.innerHTML += `${i+1} ${p}`;
		} else {
			list.innerHTML += `<span style=\"color: #aa0000;\">${i+1} ${p} </span>`;
		}
		if (knownRoles[p] != null) {
			let role = knownRoles[p];
			let faction = checkFaction(role);
			list.innerHTML += ` (<span style="color:` + colours[faction] + `;">` + role + `</span>)`;
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
			console.log(token);
			ws = new WebSocket("wss://" + wslink + "listen");
			ws.onopen = () => {
				ws.send(JSON.stringify({ type: "auth", token: token, id: username }));
			};

			 ws.onmessage = (event) => {
				
				const data = JSON.parse(event.data);
				console.log("Full chat content received:", data.content);
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
					console.log("Data received:", data);
					const {
						name = "Unknown",
						cost = "??",
						cooldown = 0,
						charges = "??",
						target,
						id
					} = data;
					

					console.log("Show Ability: " + name); 

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
						}
						form.appendChild(obj);
					})
					form.addEventListener("change", function () {
						console.log("Ability used");
						const targ = [];
						for (let obj of form.children) {
							if (obj instanceof HTMLInputElement || obj instanceof HTMLSelectElement) {
								targ.push(obj.value.split(" ")[0]);
							}
						}
						console.log(targ);
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
					startPhaseTimer();
					playerList.forEach(p => {
						alive[p] = true;
					})
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
				}
				
			};
	})
}

function join() {
	console.log(username);
	console.log(token);
	console.log("JOINING", url + "join/" + encodeURIComponent(selList))
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
	console.log(ws.readyState); // prints 1
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



