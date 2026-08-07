/**
 * Fasher Draft League - custom username color command
 *
 * See server/fasher-usercolors.ts for the storage layer and why this
 * exists (Config.customcolors on the client is an indirect hash-seed
 * mechanism tied to Smogon's login server; this is a direct, locally-
 * hosted equivalent). Normally invoked from the color picker added to
 * the Settings dialog, but usable directly too.
 */

import { FasherUserColors } from '../fasher-usercolors';

export const commands: Chat.ChatCommands = {
	customcolor(target, room, user, connection) {
		if (!user.named) throw new Chat.ErrorMessage(`You must choose a name before setting a custom color.`);
		target = target.trim();
		if (!target || toID(target) === 'reset' || toID(target) === 'off') {
			FasherUserColors.remove(user.id);
			connection.popup(`Your name color has been reset to the default.`);
			return;
		}
		if (!/^#[0-9a-f]{6}$/i.test(target)) {
			throw new Chat.ErrorMessage(
				`Invalid color '${target}'. Pick one from the color picker in Settings, or use /customcolor reset to remove your custom color.`
			);
		}
		FasherUserColors.set(user.id, target.toLowerCase());
		connection.popup(`Your name color has been updated! It may take a moment (or a refresh) to show up everywhere.`);
	},
	customcolorhelp: [
		`/customcolor #rrggbb - Sets your username color to the given hex color.`,
		`/customcolor reset - Removes your custom color, going back to the default.`,
	],
};
