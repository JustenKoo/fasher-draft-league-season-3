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
				throw new Chat.ErrorMessage(`Incorrect password for '${name}'.`);
			}
		} else {
			FasherAccounts.setPassword(userid, password);
			connection.popup(
				`This name wasn't password-protected yet, so '${password}' has been set as its password. ` +
				`Remember it - use /pwlogin ${name},yourpassword to log back in as this name later.`
			);
		}

		return user.rename(name, '', false, connection, true);
	},
	pwloginhelp: [
		`/pwlogin username,password - Logs in as username. Claims username with that password if it isn't already protected, otherwise verifies it.`,
	],
};
