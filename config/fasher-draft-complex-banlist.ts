// Complex bans for Fasher Draft League: banning a specific combination
// (species + ability, species + item, etc.) rather than the whole species.
// This uses Pokemon Showdown's own built-in complex ban syntax - each
// entry is "X + Y" (all of the joined things must be true together for it
// to be banned), fed directly into the format's banlist.
//
// Ability ban example: 'Zygarde + Power Construct' bans Zygarde from
// having Power Construct specifically (Aura Break is still fine).
//
// Item ban example: 'Ursaluna-Bloodmoon + Choice Band' bans that one
// item on that one species.
//
// Z-move ban: use 'tag:zcrystal' to match ANY of the ~35 Z-crystal items
// at once, instead of listing them all individually - e.g.
// 'Ursaluna-Bloodmoon + tag:zcrystal' bans it from holding any Z-crystal,
// which is what actually enables Z-moves. (This tag is defined in
// data/tags.ts and wired into sim/team-validator.ts's checkItem - a real
// validator feature, not just a Fasher-specific hack.)
export const FasherDraftComplexBanlist: string[] = [
	'Zygarde + Power Construct',
	'Ursaluna-Bloodmoon + tag:zcrystal',
];
