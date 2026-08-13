/**
 * Fasher Draft League - custom username colors
 *
 * Lets a user directly pick their own name color (see chat-plugins/
 * fasher-customcolor.ts), rather than being stuck with whatever color
 * their name happens to hash to.
 *
 * Stored in config/colors.json - the exact same on-disk location the
 * client already fetches (see the play.pokemonshowdown.com/config/
 * colors.json symlink), just an untracked, per-deployment JSON file
 * like config/fasher-accounts.json. Each entry is a literal hex color
 * (not a hash seed like the upstream customcolors mechanism), applied
 * directly by battle-log.ts's usernameColor() with no hashing involved.
 */

import { FS } from '../lib';

const COLORS_FILE = 'config/directcolors.json';

class FasherUserColorsStore {
	private colors: { [userid: string]: string } = {};
	private loaded = false;

	private load() {
		if (this.loaded) return;
		this.loaded = true;
		const file = FS(COLORS_FILE);
		if (file.existsSync()) {
			try {
				this.colors = JSON.parse(file.readSync());
			} catch (e) {
				Monitor.warn(`Corrupted ${COLORS_FILE}, starting fresh: ${e}`);
			}
		}
	}

	private save() {
		void FS(COLORS_FILE).safeWrite(JSON.stringify(this.colors));
	}

	get(userid: string) {
		this.load();
		return this.colors[userid];
	}

	set(userid: string, hexColor: string) {
		this.load();
		this.colors[userid] = hexColor;
		this.save();
	}

	remove(userid: string) {
		this.load();
		delete this.colors[userid];
		this.save();
	}
}

export const FasherUserColors = new FasherUserColorsStore();
