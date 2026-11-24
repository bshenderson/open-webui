import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/components/chat/Messages/ResponseMessage.svelte', import.meta.url), 'utf8');
assert.match(source, /initialHeight=\{typeof embed === 'string' && embed\.includes\('hermesPulse'\) \? 96 : null\}/, 'Hermes progress embeds must retain the bounded initial height source patch');
console.log('Hermes embed initial-height source contract passed');
const history = readFileSync(new URL('../src/lib/components/chat/Messages/ResponseMessage/StatusHistory.svelte', import.meta.url), 'utf8');
assert.match(history, /export let expand = true;/, 'Status history must default to expanded');
