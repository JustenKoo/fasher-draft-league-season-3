/**
 * Fasher Draft League - /motd command
 *
 * A server-wide message shown to everyone as they log in - welcome text,
 * "week 4 has ended," league news, etc. Edit it from chat with /motd set,
 * no file editing or restart required. Data lives in fasher-motd.ts.
 */

import { FasherMotd } from '../fasher-motd';

export const commands: Chat.ChatCommands = {
	motd(target, room, user) {
		if (!target) {
			const current = FasherMotd.get();
			if (!current) return this.sendReply(`There is no MOTD set. Use /motd set [message] to set one.`);
			return this.sendReplyBox(Chat.formatText(current, true));
		}

		const spaceIndex = target.indexOf(' ');
		const subcommand = toID(spaceIndex >= 0 ? target.slice(0, spaceIndex) : target);
		const message = spaceIndex >= 0 ? target.slice(spaceIndex + 1).trim() : '';

		switch (subcommand) {
		case 'set': case 'new': {
			if (!message) return this.parse('/help motd');
			this.checkCan('bypassall');
			const filtered = this.filter(message);
			if (message !== filtered) throw new Chat.ErrorMessage(`You are not allowed to use filtered words in the MOTD.`);

			FasherMotd.set(message, user.id);
			this.sendReply(`The MOTD was set. Everyone will see it as they log in:`);
			this.sendReplyBox(Chat.formatText(message, true));
			this.globalModlog('MOTD', null, message);
			return this.privateGlobalModAction(`${user.name} set a new MOTD.`);
		}
		case 'clear': case 'off': case 'delete': {
			this.checkCan('bypassall');
			if (!FasherMotd.get()) return this.errorReply(`There is no MOTD set.`);
			FasherMotd.clear();
			this.globalModlog('MOTD CLEAR');
			return this.privateGlobalModAction(`${user.name} cleared the MOTD.`);
		}
		default:
			return this.parse('/help motd');
		}
	},
	motdhelp: [
		`/motd - Shows the current MOTD (the message shown to everyone as they log in).`,
		`/motd set [message] - Sets the MOTD. Requires: ~`,
		`/motd clear - Clears the MOTD so nothing is shown on login. Requires: ~`,
	],
};

export const loginfilter: Chat.LoginFilter = user => {
	const message = FasherMotd.get();
	if (message) user.popup(message);
};
