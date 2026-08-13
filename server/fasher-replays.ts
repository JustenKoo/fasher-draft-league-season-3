/**
 * Fasher Draft League - local replay storage
 *
 * Stock PS uploads replays to Smogon's real login server (server/rooms.ts's
 * uploadReplay(), else-branch) or to a Postgres database (server/replays.ts,
 * Config.replaysdb) - neither works here: this fork isn't a registered
 * Smogon server, and Postgres isn't installed. This is a flat-file
 * replacement, one JSON file per replay, matching the same public shape
 * the real replay.pokemonshowdown.com/{id}.json endpoint returns (see
 * replay.pokemonshowdown.com/src/replays-battle.tsx's `result` type in the
 * client repo), so the existing replay viewer app works against it
 * unmodified, and third-party tools built against the standard PS replay
 * JSON format (e.g. a battle stat parser) keep working too.
 *
 * Stored in config/replays/{id}.json - gitignored, per-deployment, same
 * category as config/fasher-accounts.json et al. Served to the browser by
 * a dedicated route in server/sockets.ts (not server/static/), so replay
 * data can't collide with or get overwritten by a client deploy.
 */

import { FS } from '../lib';

const REPLAYS_DIR = 'config/replays';

export interface FasherReplay {
	id: string;
	format: string;
	players: string[];
	log: string;
	uploadtime: number;
	views: number;
	rating: number;
	private: number;
	password: string | null;
}

class FasherReplayStore {
	private dirReady = false;
	private ensureDir() {
		if (this.dirReady) return;
		this.dirReady = true;
		FS(REPLAYS_DIR).mkdirpSync();
	}
	private file(id: string) {
		return FS(`${REPLAYS_DIR}/${id}.json`);
	}
	/** Saves a replay, returning the id (with -{password}pw suffix if private). */
	add(replay: Omit<FasherReplay, 'views'>) {
		this.ensureDir();
		const data: FasherReplay = { views: 0, ...replay };
		void this.file(replay.id).safeWrite(JSON.stringify(data));
		return replay.id + (replay.password ? `-${replay.password}pw` : '');
	}
}

export const FasherReplays = new FasherReplayStore();
