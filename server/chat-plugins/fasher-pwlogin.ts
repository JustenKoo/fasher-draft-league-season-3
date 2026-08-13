/**
 * Fasher Draft League - password login
 *
 * See server/fasher-accounts.ts for why this exists: the server runs with
 * Config.noguestsecurity, which normally lets anyone claim any name with
 * no verification. This command layers a local, this-server-only password
 * on top of that, so league members can protect their name (particularly
 * during an active battle) without needing real Smogon account
 * registration.
 */

import { Utils } from '../../lib';
import { FasherAccounts } from '../fasher-accounts';

export const commands: Chat.ChatCommands = {
	pwlogin(target, room, user, connection) {
		const [name, password] = Utils.splitFirst(target, ',').map(s => s.trim());
		if (!name || !password) return this.parse('/help pwlogin');

		const userid = toID(name);
		if (!userid) throw new Chat.ErrorMessage(`'${name}' is not a valid username.`);

		if (FasherAccounts.hasPassword(userid)) {
			if (!FasherAccounts.checkPassword(userid, password)) {
				// Sent as |nametaken| (not a thrown ErrorMessage) so the
				// client's login dialog reopens with the password field
				// still showing, instead of just a disconnected popup -
				// see the 'nametaken' case in client-main.ts.
				user.send(`|nametaken|${name}|Incorrect password for '${name}'.`);
				return;
			}
		} else {
			FasherAccounts.setPassword(userid, password);
			connection.popup(
				`This name wasn't password-protected yet, so '${password}' has been set as its password. ` +
				`Remember it - use /pwlogin ${name},yourpassword to log back in as this name later.`
			);
		}

		// 'registered' (not plain true) - see the preVerified doc on
		// rename() in users.ts. Without it, this login would be treated as
		// an unverified guest name claim: it'd lose whatever rank the name
		// actually has, and - the bug this was added to fix - it wouldn't
		// be allowed to take over a stale session already using the name
		// (e.g. a PC that was turned off, not cleanly disconnected) unless
		// it happened to come from the same IP.
		return user.rename(name, '', true, connection, 'registered');
	},
	pwloginhelp: [
		`/pwlogin username,password - Logs in as username. Claims username with that password if it isn't already protected, otherwise verifies it.`,
	],
};
