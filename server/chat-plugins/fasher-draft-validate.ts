/**
 * Fasher Draft League - /draftvalidate command
 *
 * The Draft Plan Mode "Validate" button sends this instead of the stock
 * /vtm for box teams - see the 'validate' client command in the client
 * repo's panel-teambuilder-team.tsx. See fasher-draft-validate.ts for the
 * actual validation logic and why this exists instead of just using /vtm.
 */

import { validateDraftBox } from '../fasher-draft-validate';

export const commands: Chat.ChatCommands = {
	draftvalidate(target, room, user, connection) {
		if (Monitor.countPrepBattle(connection.ip, connection)) return;
		if (!target) throw new Chat.ErrorMessage(`Provide a valid format.`);
		const format = Dex.formats.get(target);
		if (format.effectType !== 'Format') return this.popupReply(`Please provide a valid format.`);

		const message = validateDraftBox(user.battleSettings.team, format.id);
		connection.popup(message);
	},
	draftvalidatehelp: [`/draftvalidate [format] - Validates your current Draft Plan box (set with /utm).`],
};
