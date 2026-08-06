// Complex bans for Fasher Draft League: banning a specific combination
// (species + ability, species + Z-move access, etc.) rather than the whole
// species, with a custom error message instead of PS's generic
// "X has the combination of Y + Z, which is banned." wording.
//
// Ability ban: set `ability` to the ability's name (must match how it
// appears in the dex, e.g. "Power Construct").
//
// Z-move ban: set `zMoveBanned: true` - this bans holding ANY of the ~35
// Z-crystal items, not just one specific crystal (checked via the item's
// own `zMove` flag, same pattern already used elsewhere in this codebase).
export interface FasherComplexBan {
	species: string;
	ability?: string;
	zMoveBanned?: boolean;
	message: string;
}

export const FasherDraftComplexBanlist: FasherComplexBan[] = [
	{
		species: 'Zygarde',
		ability: 'Power Construct',
		message: "Zygarde's ability Power Construct is banned.",
	},
	{
		species: 'Ursaluna-Bloodmoon',
		zMoveBanned: true,
		message: "Ursaluna-Bloodmoon is Z-Move banned.",
	},
];
