import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/components/chat/Chat.svelte', import.meta.url), 'utf8');
const start = source.indexOf("} else if (type === 'chat:message:embeds' || type === 'embeds') {");
assert.ok(start >= 0);
const branch = source.slice(start, source.indexOf("} else if (type === 'chat:message:error')", start));
const body = branch.slice(branch.indexOf('{') + 1);
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('data', 'message', 'event', 'tick', 'setTimeout', 'document', body);
let scrolls = 0;
let timers = 0;
const message = {};
const run = async (embeds) => {
  await execute({ embeds }, message, { message_id: 'owned' }, async () => {}, (fn) => { timers++; fn(); }, {
    getElementById(id) { assert.equal(id, 'owned-embeds-container'); return { scrollIntoView() { scrolls++; } }; }
  });
  assert.equal(message.embeds, embeds);
};
for (let i = 0; i < 100; i++) await run([`<html><style>@keyframes hermesPulse {}</style>progress ${i}</html>`]);
assert.equal(scrolls, 0, 'repeated passive progress updates must not recenter the viewport');
assert.equal(timers, 0, 'passive progress must not queue delayed scroll callbacks');
await run(['<html>interactive result</html>']);
assert.equal(scrolls, 1, 'retain native behavior for ordinary interactive embeds');
await run([]);
console.log('GXTD-726: 100 progress replacements preserve viewport; ordinary embeds retain native behavior');
