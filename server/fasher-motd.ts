/**
 * Fasher Draft League - message of the day
 *
 * This codebase has no built-in MOTD system (nothing named "motd" exists
 * anywhere under server/ otherwise). This is a minimal flat-file version,
 * same pattern as fasher-replays.ts/fasher-friends.ts - a single JSON file
 * under config/, gitignored, per-deployment. See chat-plugins/fasher-motd.ts
 * for the /motd command and the loginfilter that displays it.
 */

import { FS } from '../lib';

const MOTD_FILE = 'config/fasher-motd.json';

interface MotdData {
	message: string | null;
	setBy: string | null;
	setAt: number;
}

class FasherMotdStore {
	private data: MotdData = { message: null, setBy: null, setAt: 0 };
	private loaded = false;

	private load() {
		if (this.loaded) return;
		this.loaded = true;
		const file = FS(MOTD_FILE);
		if (file.existsSync()) {
			try {
				this.data = { message: null, setBy: null, setAt: 0, ...JSON.parse(file.readSync()) };
			} catch (e) {
				Monitor.warn(`Corrupted ${MOTD_FILE}, starting fresh: ${e}`);
			}
		}
	}
	private save() {
		// writeUpdate, not safeWrite - see the comment on FasherFriendsDatabase's
		// save() in fasher-friends.ts for why (two overlapping safeWrite calls
		// to the same path can crash with ENOENT on the rename step).
		FS(MOTD_FILE).writeUpdate(() => JSON.stringify(this.data));
	}
	get() {
		this.load();
		return this.data.message;
	}
	set(message: string, setBy: ID) {
		this.load();
		this.data = { message, setBy, setAt: Date.now() };
		this.save();
	}
	clear() {
		this.load();
		this.data = { message: null, setBy: null, setAt: 0 };
		this.save();
	}
}

export const FasherMotd = new FasherMotdStore();
