import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const [workflow] = JSON.parse(readFileSync(new URL('../workflows/[CORE] Ingestion & Routage Tickets.json', import.meta.url)));
const ticket = { ticket_id: '11111111-1111-4111-8111-111111111111',
  alerte_immediate: true, idempotency_key: 'tickets:11111111-1111-4111-8111-111111111111:INSERT:nouveau' };
const node = name => workflow.nodes.find(n => n.name === name);
function evaluate(expression, initial = ticket) {
  return vm.runInNewContext(`(${expression.slice(3, -2)})`, {
    $json: {}, $: () => ({ first: () => ({ json: initial }) }),
    $env: { SUPABASE_URL: 'https://example.supabase.co' },
  });
}

test('un GET vide ne fait pas perdre la priorité utilisée par le routage', () => {
  const condition = node('Alerte immediate ?').parameters.conditions.boolean[0].value1;
  assert.equal(evaluate(condition), true);
  assert.equal(evaluate(condition, { ...ticket, alerte_immediate: false }), false);
});

test('un GET vide ne fait pas perdre le ticket ciblé par le PATCH', () => {
  assert.equal(evaluate(node('Mise a jour en cours').parameters.url),
    'https://example.supabase.co/rest/v1/tickets?id=eq.11111111-1111-4111-8111-111111111111');
});
