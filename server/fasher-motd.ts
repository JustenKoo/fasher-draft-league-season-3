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
			this.data = { message: null, setBy: null, setAt: 0, ...JSON.parse(file.readSync()) };
		}
	}
	get() {
		this.load();
		return this.data.message;
	}
	set(message: string, setBy: ID) {
		this.load();
		this.data = { message, setBy, setAt: Date.now() };
		void FS(MOTD_FILE).safeWrite(JSON.stringify(this.data));
	}
	clear() {
		this.load();
		this.data = { message: null, setBy: null, setAt: 0 };
		void FS(MOTD_FILE).safeWrite(JSON.stringify(this.data));
	}
}

export const FasherMotd = new FasherMotdStore();
