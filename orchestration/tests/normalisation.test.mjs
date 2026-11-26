import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const [workflow] = JSON.parse(readFileSync(new URL('../workflow-normalisation-filtrage.json', import.meta.url)));
const code = workflow.nodes.find((node) => node.name === 'Normalisation du ticket').parameters.jsCode;
const ticket = {
  id: '11111111-1111-4111-8111-111111111111',
  organisation_id: '22222222-2222-4222-8222-222222222222',
  titre: 'Demande de renseignement', description: 'Test', priorite: 'normale', statut: 'nouveau',
};
function normalise(record = ticket, type = 'INSERT') {
  const input = [{ json: { body: { table: 'tickets', type, record } } }];
  return vm.runInNewContext(`(function () { ${code}\n })()`, { $input: { all: () => input } })[0].json;
}

test('la clé combine table, UUID, opération et statut initial et reste stable', () => {
  assert.equal(normalise().idempotency_key, 'tickets:11111111-1111-4111-8111-111111111111:INSERT:nouveau');
  assert.equal(normalise().idempotency_key, normalise().idempotency_key);
  assert.equal(normalise({ ...ticket, statut: 'en_cours' }, 'UPDATE').idempotency_key,
    'tickets:11111111-1111-4111-8111-111111111111:UPDATE:en_cours');
});

test('les tickets normaux et critiques restent correctement routés', () => {
  assert.equal(normalise().alerte_immediate, false);
  assert.equal(normalise({ ...ticket, priorite: 'critique' }).alerte_immediate, true);
  assert.equal(normalise({ ...ticket, titre: 'PANNE réseau' }).alerte_immediate, true);
  assert.equal(normalise().ticket_id, ticket.id);
});

test('un payload sans record est refusé', () => {
  assert.throws(() => normalise(null), /record manquant/);
});
