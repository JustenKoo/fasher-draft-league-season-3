/**
 * Fasher Draft League - Pi admin CLI
 *
 * A handful of terminal commands for maintenance that doesn't have (and
 * doesn't need) an in-game chat command: resetting ladders and clearing
 * the local /pwlogin account store (config/fasher-accounts.json,
 * config/ladders/*.tsv - see FASHER-PI-OPERATIONS.md).
 *
 * Run from the repo root:
 *   node tools/fasher-admin.js <command> [args]
 *
 * Stop the server first (sudo systemctl stop pokemon-showdown) before
 * running any of the reset/clear commands - both the ladder and account
 * stores are cached in memory once the server loads them, so a live
 * server won't pick up file changes made while it's running.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LADDER_DIR = path.join(ROOT, 'config', 'ladders');
const ACCOUNTS_FILE = path.join(ROOT, 'config', 'fasher-accounts.json');

function readAccounts() {
	if (!fs.existsSync(ACCOUNTS_FILE)) return {};
	return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}
function writeAccounts(data) {
	fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));
}
function ladderFiles() {
	if (!fs.existsSync(LADDER_DIR)) return [];
	return fs.readdirSync(LADDER_DIR).filter(f => f.endsWith('.tsv'));
}
function parseLadder(file) {
	const raw = fs.readFileSync(path.join(LADDER_DIR, file), 'utf8');
	const lines = raw.split('\n').slice(1); // skip header row
	const rows = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const [elo, username, w, l, t] = trimmed.split('\t');
		rows.push({ elo: Number(elo), username, w: Number(w), l: Number(l), t: Number(t) });
	}
	rows.sort((a, b) => b.elo - a.elo);
	return rows;
}
function restartReminder() {
	console.log(`\nRemember to restart the server for this to take effect: sudo systemctl restart pokemon-showdown`);
}

const commands = {
	'reset-ladders'() {
		const files = ladderFiles();
		if (!files.length) {
			console.log('No ladder files found - nothing to reset.');
			return;
		}
		for (const file of files) fs.unlinkSync(path.join(LADDER_DIR, file));
		console.log(`Reset ${files.length} ladder${files.length === 1 ? '' : 's'}: ${files.map(f => f.replace(/\.tsv$/, '')).join(', ')}`);
		restartReminder();
	},
	'reset-ladder'(formatid) {
		if (!formatid) {
			console.log('Usage: node tools/fasher-admin.js reset-ladder <formatid>');
			process.exit(1);
		}
		const file = path.join(LADDER_DIR, `${formatid}.tsv`);
		if (!fs.existsSync(file)) {
			console.log(`No ladder file found for '${formatid}' - nothing to reset.`);
			return;
		}
		fs.unlinkSync(file);
		console.log(`Reset the ladder for '${formatid}'.`);
		restartReminder();
	},
	'list-ladders'() {
		const files = ladderFiles();
		if (!files.length) {
			console.log('No ladder files found.');
			return;
		}
		for (const file of files) {
			const formatid = file.replace(/\.tsv$/, '');
			const rows = parseLadder(file);
			console.log(`\n${formatid} (${rows.length} player${rows.length === 1 ? '' : 's'}):`);
			for (const row of rows) {
				console.log(`  ${row.elo}\t${row.username}\t(${row.w}W ${row.l}L ${row.t}T)`);
			}
		}
	},
	'clear-accounts'() {
		const accounts = readAccounts();
		const count = Object.keys(accounts).length;
		if (!count) {
			console.log('No accounts found - nothing to clear.');
			return;
		}
		writeAccounts({});
		console.log(`Cleared ${count} account${count === 1 ? '' : 's'}. All names are now freely claimable again.`);
		restartReminder();
	},
	'clear-account'(username) {
		if (!username) {
			console.log('Usage: node tools/fasher-admin.js clear-account <username>');
			process.exit(1);
		}
		const userid = toID(username);
		const accounts = readAccounts();
		if (!(userid in accounts)) {
			console.log(`'${username}' has no stored password - nothing to clear.`);
			return;
		}
		delete accounts[userid];
		writeAccounts(accounts);
		console.log(`Cleared the account for '${username}'. The name is now freely claimable again.`);
		restartReminder();
	},
	'list-accounts'() {
		const accounts = readAccounts();
		const ids = Object.keys(accounts);
		if (!ids.length) {
			console.log('No accounts found.');
			return;
		}
		console.log(`${ids.length} registered username${ids.length === 1 ? '' : 's'} (stored in lowercase form):`);
		for (const id of ids.sort()) console.log(`  ${id}`);
	},
};

function toID(text) {
	return ('' + text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function printHelp() {
	console.log(`Fasher Draft League admin CLI

Usage: node tools/fasher-admin.js <command> [args]

Commands:
  reset-ladders                Delete all ladder data (every format)
  reset-ladder <formatid>      Delete one format's ladder data
  list-ladders                 List every ladder and its current rankings
  clear-accounts               Remove all /pwlogin username/password protection
  clear-account <username>     Remove /pwlogin protection for one username
  list-accounts                List all password-protected usernames

Stop the server first (sudo systemctl stop pokemon-showdown) before running
any reset/clear command - the running server caches this data in memory and
won't see file changes until it restarts.`);
}

const [, , cmd, ...args] = process.argv;
if (!cmd || !commands[cmd]) {
	printHelp();
	process.exit(cmd ? 1 : 0);
}
commands[cmd](...args);
