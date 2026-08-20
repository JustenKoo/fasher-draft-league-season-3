/**
 * Fasher Draft League - draft box validation
 *
 * A box holds a coach's whole draft pool (10-12+ Pokemon), not a 6-Pokemon
 * battle team, so the stock /vtm command is the wrong tool: it hard-rejects
 * anything over the format's normal team size, and individual-set checks
 * like "did you forget to EV it?"/"has no moves" are battle-readiness nags
 * that don't make sense while still drafting. This reuses the real
 * TeamValidator for actual legality (species/moves/items/abilities/complex
 * bans - same engine /vtm uses, so a real problem here is still a real
 * problem), just skipping the whole-team battle-size gate and the two
 * "you haven't finished this set yet" set-level nags, and layering the
 * draft points budget on top.
 */

import { TeamValidator } from '../sim/team-validator';
import { Teams, type PokemonSet } from '../sim/teams';
import { FasherDraftPointValues, FASHER_DRAFT_BUDGET } from '../config/fasher-draft-points';

// These are real TeamValidator messages (see sim/team-validator.ts), but
// they're "you haven't finished planning this Pokemon yet" nags aimed at a
// battle-ready team, not legality problems - not useful while drafting.
const IGNORED_PROBLEM_SUBSTRINGS = [
	'did you forget to EV it',
	'has no moves (it must have at least one to be usable)',
];

/** Fasher Draft League: draft point cost of a set, including the Tera Captain multiplier - matches battle-team-editor.tsx's draftPointsForSet() in the client repo. */
function draftPointsForSet(set: PokemonSet): number {
	const cost = FasherDraftPointValues[set.species]?.cost;
	if (cost === undefined) return 0;
	if (!set.teraCaptain && !set.teraCaptainSecondary) return cost;
	return cost === 1 ? 2 : Math.floor(cost * 1.5);
}

/**
 * Validates a draft box: real per-Pokemon legality (species/moves/items/
 * abilities/complex bans), minus battle-team-only concerns, plus the draft
 * points budget. Returns the popup message text.
 */
export function validateDraftBox(packedTeam: string, formatid: string): string {
	const validator = TeamValidator.get(formatid);
	const team = Teams.unpack(packedTeam);
	if (!team) return `Your Draft Plan couldn't be read. If you're not using a custom client, please report this as a bug.`;

	const problems: string[] = [];
	const teamHas: AnyObject = {};
	let spent = 0;
	for (const set of team) {
		const setProblems = validator.validateSet(set, teamHas) || [];
		for (const problem of setProblems) {
			if (IGNORED_PROBLEM_SUBSTRINGS.some(s => problem.includes(s))) continue;
			problems.push(problem);
		}
		spent += draftPointsForSet(set);
	}

	if (spent > FASHER_DRAFT_BUDGET) {
		problems.push(`Your Draft Plan is over budget by ${spent - FASHER_DRAFT_BUDGET} points (spent ${spent}/${FASHER_DRAFT_BUDGET}).`);
	}

	if (problems.length) {
		return `Your Draft Plan was rejected for the following reasons:\n\n- ${problems.join('\n- ')}`;
	}

	const remaining = FASHER_DRAFT_BUDGET - spent;
	if (remaining > 0) {
		return `Your Draft Plan is Valid, but you have ${remaining} unused points.`;
	}
	return `Your Draft Plan is Valid.`;
}
