/**
 * Fasher Draft League - flat-file friends list
 *
 * Stock PS's friends list (server/friends.ts) requires better-sqlite3 (not
 * installed here) plus Config.usesqlite/usesqlitefriends, and gates usage
 * behind user.autoconfirmed - a real, week-old, one-rated-win Smogon
 * account. Nothing on this deployment can ever satisfy that (same root
 * cause as fasher-accounts.ts/fasher-pwlogin.ts: no real login server).
 *
 * This is a drop-in replacement for FriendsDatabase (server/friends.ts)
 * implementing the same public method signatures, so chat-plugins/
 * friends.ts's calls to Chat.Friends.* don't need to change - only which
 * class gets instantiated as Chat.Friends (see server/chat.ts) and the
 * registration gate in checkCanUse()/loginfilter (chat-plugins/friends.ts).
 *
 * Backed by a single JSON file, config/fasher-friends.json - gitignored,
 * per-deployment, same as config/fasher-accounts.json and
 * config/directcolors.json.
 */

import { FS, Utils } from '../lib';
import { sendPM, type Friend } from './friends';

const FRIENDS_FILE = 'config/fasher-friends.json';
export const MAX_FRIENDS = 100;
export const MAX_REQUESTS = 6;

interface FriendRequest {
	sender: ID;
	receiver: ID;
	sentAt: number;
}
interface FriendSettings {
	sendLoginData: boolean;
	lastLogin: number;
	publicList: boolean;
}
interface FriendsData {
	/** Undirected pairs. A pair [a, b] means a and b are friends. */
	pairs: [ID, ID][];
	requests: FriendRequest[];
	settings: { [userid: string]: FriendSettings };
}

function pairKey(a: ID, b: ID) {
	return [a, b].sort().join(',');
}

export class FasherFriendsDatabase {
	private data: FriendsData = { pairs: [], requests: [], settings: {} };
	private loaded = false;

	private load() {
		if (this.loaded) return;
		this.loaded = true;
		const file = FS(FRIENDS_FILE);
		if (file.existsSync()) {
			try {
				const saved = JSON.parse(file.readSync());
				this.data = { pairs: [], requests: [], settings: {}, ...saved };
			} catch (e) {
				Monitor.warn(`Corrupted ${FRIENDS_FILE}, starting fresh: ${e}`);
			}
		}
	}
	private save() {
		// writeUpdate (not safeWrite) because save() has many independent
		// call sites that can fire close together (a friend request cascades
		// into several state changes) - safeWrite's own write-then-rename
		// isn't safe against two overlapping calls to itself, which is
		// exactly what caused the "rename .NEW -> fasher-friends.json:
		// ENOENT" crash: one call's rename already moved the .NEW file out
		// from under the other's. writeUpdate queues/coalesces concurrent
		// calls into a single in-flight write instead of racing.
		FS(FRIENDS_FILE).writeUpdate(() => JSON.stringify(this.data));
	}
	private getSettingsRaw(userid: ID): FriendSettings {
		return this.data.settings[userid] || { sendLoginData: false, lastLogin: 0, publicList: false };
	}
	private isFriend(a: ID, b: ID) {
		this.load();
		const key = pairKey(a, b);
		return this.data.pairs.some(pair => pairKey(pair[0], pair[1]) === key);
	}
	private countFriends(userid: ID) {
		this.load();
		return this.data.pairs.filter(([a, b]) => a === userid || b === userid).length;
	}
	private countRequests(userid: ID) {
		this.load();
		return this.data.requests.filter(r => r.sender === userid || r.receiver === userid).length;
	}

	async updateUserCache(user: User) {
		user.friends = new Set();
		const friends = await this.getFriends(user.id);
		for (const friend of friends) {
			user.friends.add(friend.userid);
		}
		return user.friends;
	}
	async getFriends(userid: ID): Promise<Friend[]> {
		this.load();
		const friends: Friend[] = [];
		for (const [a, b] of this.data.pairs) {
			let friendID: ID | null = null;
			if (a === userid) friendID = b;
			else if (b === userid) friendID = a;
			if (!friendID) continue;
			const settings = this.getSettingsRaw(friendID);
			friends.push({
				userid: friendID,
				friend: friendID,
				send_login_data: settings.sendLoginData ? 1 : 0,
				last_login: settings.lastLogin,
				public_list: settings.publicList ? 1 : 0,
				allowing_login: 0,
			});
			if (friends.length >= MAX_FRIENDS) break;
		}
		return friends;
	}
	async getRequests(user: User) {
		this.load();
		const sent = new Set<string>();
		const received = new Set<string>();
		if (user.settings.blockFriendRequests) {
			this.data.requests = this.data.requests.filter(r => r.receiver !== user.id);
			this.save();
		}
		for (const r of this.data.requests) {
			if (r.sender === user.id) sent.add(r.receiver);
			if (r.receiver === user.id) received.add(r.sender);
		}
		return { sent, received };
	}
	async request(user: User, receiverID: ID) {
		this.load();
		const receiver = Users.getExact(receiverID);
		if (receiverID === user.id || receiver?.previousIDs.includes(user.id)) {
			throw new Chat.ErrorMessage(`You can't friend yourself.`);
		}
		if (receiver?.settings.blockFriendRequests) {
			throw new Chat.ErrorMessage(`This user is blocking friend requests.`);
		}
		if (this.countFriends(user.id) >= MAX_FRIENDS) {
			throw new Chat.ErrorMessage(`You are at the maximum number of friends.`);
		}
		if (this.isFriend(user.id, receiverID)) {
			throw new Chat.ErrorMessage(`You are already friends with '${receiverID}'.`);
		}
		if (this.data.requests.some(r => r.sender === user.id && r.receiver === receiverID)) {
			throw new Chat.ErrorMessage(`You have already sent a friend request to '${receiverID}'.`);
		}
		if (this.countRequests(user.id) >= MAX_REQUESTS) {
			throw new Chat.ErrorMessage(
				`You already have ${MAX_REQUESTS} pending friend requests. Use "/friends view sent" to see your outgoing ` +
				`requests and "/friends view receive" to see your incoming requests.`
			);
		}
		this.data.requests.push({ sender: user.id, receiver: receiverID, sentAt: Date.now() });
		this.save();

		let buf = Utils.html`/uhtml sent-${user.id},<button class="button" name="send" value="/friends accept ${user.id}">Accept</button> | `;
		buf += Utils.html`<button class="button" name="send" value="/friends reject ${user.id}">Deny</button><br /> `;
		buf += `<small>(You can also stop this user from sending you friend requests with <code>/ignore</code>)</small>`;
		const disclaimer = (
			`/raw <small>Note: If this request is accepted, your friend will be notified when you come online, ` +
			`and you will be notified when they do, unless you opt out of receiving them.</small>`
		);
		if (receiver) {
			sendPM(`/raw <span class="username">${user.name}</span> sent you a friend request!`, receiver.id, user.id);
			sendPM(buf, receiver.id, user.id);
			sendPM(disclaimer, receiver.id, user.id);
		}
		sendPM(
			`/nonotify You sent a friend request to ${receiver?.connected ? receiver.name : receiverID}!`,
			user.name,
			receiverID
		);
		sendPM(
			`/uhtml undo-${receiverID},<button class="button" name="send" value="/friends undorequest ${Utils.escapeHTML(receiverID)}">` +
			`<i class="fa fa-undo"></i> Undo</button>`, user.name, receiverID
		);
		sendPM(disclaimer, user.id, receiverID);
	}
	async removeRequest(receiverID: ID, senderID: ID) {
		this.load();
		if (!senderID) throw new Chat.ErrorMessage(`Invalid sender username.`);
		if (!receiverID) throw new Chat.ErrorMessage(`Invalid receiver username.`);
		const before = this.data.requests.length;
		this.data.requests = this.data.requests.filter(r => !(r.sender === senderID && r.receiver === receiverID));
		this.save();
		return { changes: before - this.data.requests.length };
	}
	async approveRequest(receiverID: ID, senderID: ID) {
		this.load();
		if (this.countFriends(receiverID) >= MAX_FRIENDS) {
			throw new Chat.ErrorMessage(`You are at the maximum number of friends.`);
		}
		const { changes } = await this.removeRequest(receiverID, senderID);
		if (!changes) throw new Chat.ErrorMessage(`You have no request pending from ${senderID}.`);
		this.data.pairs.push([senderID, receiverID]);
		this.save();
	}
	async removeFriend(userid: ID, friendID: ID) {
		this.load();
		if (!friendID || !userid) throw new Chat.ErrorMessage(`Invalid usernames supplied.`);
		const key = pairKey(userid, friendID);
		const before = this.data.pairs.length;
		this.data.pairs = this.data.pairs.filter(pair => pairKey(pair[0], pair[1]) !== key);
		if (this.data.pairs.length === before) {
			throw new Chat.ErrorMessage(`You do not have ${friendID} friended.`);
		}
		this.save();
	}
	writeLogin(userid: ID) {
		this.load();
		const settings = this.getSettingsRaw(userid);
		settings.lastLogin = Date.now();
		this.data.settings[userid] = settings;
		this.save();
	}
	hideLoginData(id: ID) {
		this.load();
		const settings = this.getSettingsRaw(id);
		settings.sendLoginData = true;
		this.data.settings[id] = settings;
		this.save();
	}
	allowLoginData(id: ID) {
		this.load();
		const settings = this.getSettingsRaw(id);
		settings.sendLoginData = false;
		this.data.settings[id] = settings;
		this.save();
	}
	async getLastLogin(userid: ID) {
		this.load();
		return this.getSettingsRaw(userid).lastLogin || null;
	}
	async getSettings(userid: ID) {
		this.load();
		const settings = this.getSettingsRaw(userid);
		return {
			send_login_data: settings.sendLoginData ? 1 : 0,
			last_login: settings.lastLogin,
			public_list: settings.publicList ? 1 : 0,
		};
	}
	setHideList(userid: ID, setting: boolean) {
		this.load();
		const settings = this.getSettingsRaw(userid);
		settings.publicList = setting;
		this.data.settings[userid] = settings;
		this.save();
	}
	async findFriendship(user1: string, user2: string): Promise<boolean> {
		this.load();
		return this.isFriend(toID(user1), toID(user2));
	}
}
