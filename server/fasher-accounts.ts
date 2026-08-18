/**
 * Fasher Draft League - local account passwords
 *
 * A lightweight username/password system for this league, independent of
 * Smogon's login server. This exists because the server runs with
 * Config.noguestsecurity (see server/users.ts validateToken), which lets
 * anyone claim any non-trusted username with no verification at all -
 * fine for casual testing, but not for protecting a name mid-battle in
 * real league play. This does not touch Smogon accounts in any way; it
 * only protects names on this specific server.
 *
 * Passwords are scrypt-hashed with a per-account random salt and stored
 * in config/fasher-accounts.json (gitignored, per-deployment, like
 * config/config.js). This is NOT the same security bar as a real account
 * system - it's meant to stop a fellow league member from casually typing
 * someone else's name mid-battle, not to resist serious attack. League
 * members should be told not to reuse a password they use elsewhere.
 */

import * as crypto from 'crypto';
import { FS } from '../lib';

const ACCOUNTS_FILE = 'config/fasher-accounts.json';

interface AccountRecord {
	salt: string;
	hash: string;
}

class FasherAccountsStore {
	private accounts: { [userid: string]: AccountRecord } = {};
	private loaded = false;

	private load() {
		if (this.loaded) return;
		this.loaded = true;
		const file = FS(ACCOUNTS_FILE);
		if (file.existsSync()) {
			try {
				this.accounts = JSON.parse(file.readSync());
			} catch (e) {
				Monitor.warn(`Corrupted ${ACCOUNTS_FILE}, starting fresh: ${e}`);
			}
		}
	}

	private save() {
		// writeUpdate, not safeWrite - see the comment on FasherFriendsDatabase's
		// save() in fasher-friends.ts for why (two overlapping safeWrite calls
		// to the same path can crash with ENOENT on the rename step).
		FS(ACCOUNTS_FILE).writeUpdate(() => JSON.stringify(this.accounts));
	}

	private hash(password: string, salt: string) {
		return crypto.scryptSync(password, salt, 64).toString('hex');
	}

	hasPassword(userid: string) {
		this.load();
		return Object.prototype.hasOwnProperty.call(this.accounts, userid);
	}

	setPassword(userid: string, password: string) {
		this.load();
		const salt = crypto.randomBytes(16).toString('hex');
		this.accounts[userid] = { salt, hash: this.hash(password, salt) };
		this.save();
	}

	checkPassword(userid: string, password: string) {
		this.load();
		const record = this.accounts[userid];
		if (!record) return false;
		const given = Buffer.from(this.hash(password, record.salt), 'hex');
		const expected = Buffer.from(record.hash, 'hex');
		if (given.length !== expected.length) return false;
		return crypto.timingSafeEqual(given, expected);
	}
}

export const FasherAccounts = new FasherAccountsStore();
