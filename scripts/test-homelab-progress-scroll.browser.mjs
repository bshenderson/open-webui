// GXTD-726: browser-level regression for the passive-progress scroll guard.
// Extracts the actual 'chat:message:embeds' branch from Chat.svelte, executes
// it inside real Chromium against a scrollable DOM, and asserts:
//   1. 100 repeated passive hermesPulse embed updates never call
//      scrollIntoView and never move the viewport (no recentering);
//   2. an ordinary interactive embed still scrolls its container into view.
// Requires playwright-core resolvable via NODE_PATH and a Chromium build in
// the Playwright browser cache (see scripts/test-homelab-progress-scroll.mjs
// for the Node-only extraction test this complements).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
	({ chromium } = require('playwright-core'));
} catch {
	console.log('playwright-core unavailable; skipping browser regression');
	process.exit(0);
}

const source = readFileSync(new URL('../src/lib/components/chat/Chat.svelte', import.meta.url), 'utf8');
const start = source.indexOf("} else if (type === 'chat:message:embeds' || type === 'embeds') {");
assert.ok(start >= 0, 'embeds event branch not found in Chat.svelte');
const branch = source.slice(start, source.indexOf("} else if (type === 'chat:message:error')", start));
const body = branch.slice(branch.indexOf('{') + 1);

// Build the page: a tall document so the embeds container sits far below the
// fold; a real scrollIntoView would visibly move window.scrollY.
const page = `<!doctype html><html><body>
<div style="height:4000px">filler above</div>
<div id="owned-embeds-container" style="height:96px">embeds</div>
<div style="height:4000px">filler below</div>
<script>
window.__branchBody = ${JSON.stringify(body)};
window.__calls = [];
const container = document.getElementById('owned-embeds-container');
container.scrollIntoView = function (opts) { window.__calls.push(opts || {}); Element.prototype.scrollIntoView.call(this, opts); };
</script></body></html>`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
	const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
	const tab = await context.newPage();
	await tab.setContent(page);
	await tab.evaluate(() => window.scrollTo(0, 0));

	// Construct the AsyncFunction from the real extracted branch body.
	const runBranch = await tab.evaluate(() => {
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		window.__run = new AsyncFunction('data', 'message', 'event', 'tick', 'document', window.__branchBody);
		return true;
	});
	assert.ok(runBranch);

	const fireEvent = (embeds) =>
		tab.evaluate((emb) => {
			const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			return window.__run(
				{ embeds: emb },
				{ embeds: null },
				{ message_id: 'owned' },
				tick,
				document
			);
		}, embeds);

	// 1. Passive progress: 100 repeated updates must not touch scroll at all.
	for (let i = 0; i < 100; i++) {
		await fireEvent([`<html><style>@keyframes hermesPulse {}</style>progress ${i}</html>`]);
	}
	let calls = await tab.evaluate(() => window.__calls.length);
	let scrollY = await tab.evaluate(() => window.scrollY);
	assert.equal(calls, 0, 'repeated passive progress updates must not call scrollIntoView in a real browser');
	assert.equal(scrollY, 0, 'viewport must not move during passive progress updates');

	// 2. Ordinary interactive embed: native centering retained.
	await fireEvent(['<html>interactive result</html>']);
	await tab.waitForFunction(() => window.__calls.length > 0, null, { timeout: 5000 });
	calls = await tab.evaluate(() => window.__calls.length);
	assert.ok(calls >= 1, 'ordinary interactive embeds must still scroll their container into view');
	const opts = await tab.evaluate(() => window.__calls[0]);
	assert.equal(opts.block, 'center', 'interactive embed centering behavior preserved');
	await tab.waitForFunction(() => window.scrollY > 0, null, { timeout: 5000 });

	// 3. Mixed stream: passive updates interleaved after a real embed keep
	// the reader's position where they left it.
	await tab.waitForFunction(() => window.scrollY > 0, null, { timeout: 5000 });
	await tab.evaluate(
		() =>
			new Promise((r) => {
				let last = -1;
				let stable = 0;
				const poll = () => {
					if (window.scrollY === last) stable++;
					else stable = 0;
					last = window.scrollY;
					if (stable >= 4) r(null);
					else requestAnimationFrame(poll);
				};
				requestAnimationFrame(poll);
			})
	);
	const before = await tab.evaluate(() => window.scrollY);
	for (let i = 0; i < 20; i++) {
		await fireEvent([`<html><style>@keyframes hermesPulse {}</style>progress again ${i}</html>`]);
	}
	calls = await tab.evaluate(() => window.__calls.length);
	const after = await tab.evaluate(() => window.scrollY);
	assert.equal(calls, 1, 'no additional scrollIntoView from interleaved passive updates');
	assert.equal(after, before, 'viewport position preserved across interleaved passive updates');

	console.log('GXTD-726 browser regression: 100+20 passive progress updates moved no scroll; interactive embed scrollIntoView(block:center) retained');
} finally {
	await browser.close();
}
