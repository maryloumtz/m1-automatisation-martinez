import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function normalise(payload) {
  const [workflow] = JSON.parse(readFileSync(new URL('../workflows/[OPS] Global Error Handler.json', import.meta.url)));
  const code = workflow.nodes.find(node => node.name === 'Normaliser incident').parameters.jsCode;
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function () { ${code}\n })()`, {
    $input: { all: () => [{ json: payload }] },
  })[0].json));
}

test('conserve le diagnostic officiel et le snapshot comme objet JSON natif', () => {
  const payload = { execution: { id: 542, url: 'http://localhost:5678/execution/542',
    lastNodeExecuted: 'Normalisation du ticket', error: { message: 'Crash de test DLQ', stack: 'trace', node: { name: 'Autre' } } },
    workflow: { name: '[CORE] Ingestion & Routage Tickets' } };
  const result = normalise(payload);
  assert.equal(result.execution_id, '542');
  assert.equal(result.workflow_name, '[CORE] Ingestion & Routage Tickets');
  assert.equal(result.failed_node, 'Normalisation du ticket');
  assert.equal(result.error_message, 'Crash de test DLQ');
  assert.deepEqual(result.payload_snapshot, payload);
  for (const value of ['542', '[CORE] Ingestion & Routage Tickets', 'Normalisation du ticket', 'Crash de test DLQ']) {
    assert.ok(result.alert_message.includes(value));
  }
});

test('accepte les champs manquants et utilise le nœud imbriqué en secours', () => {
  for (const payload of [undefined, null, {}, { execution: null, workflow: null }]) {
    const result = normalise(payload);
    assert.equal(result.execution_id, 'unknown');
    assert.equal(result.workflow_name, 'unknown');
    assert.equal(result.failed_node, 'unknown');
    assert.equal(result.error_message, 'Erreur inconnue');
    assert.equal(typeof result.payload_snapshot, 'object');
    assert.notEqual(result.payload_snapshot, null);
  }
  assert.equal(normalise({ execution: { error: { node: { name: 'PATCH' } } } }).failed_node, 'PATCH');
  assert.equal(normalise({ execution: { lastNodeExecuted: '', error: { node: { name: 'PATCH' } } } }).failed_node, 'PATCH');
  assert.equal(normalise({ execution: { error: { message: '', cause: { message: 'Cause utile' } } } }).error_message, 'Cause utile');
});

test('capture aussi une erreur du trigger sans execution.id', () => {
  const result = normalise({ trigger: { error: { node: { name: 'Webhook' }, message: 'Activation impossible' } } });
  assert.equal(result.execution_id, 'unknown');
  assert.equal(result.failed_node, 'Webhook');
  assert.equal(result.error_message, 'Activation impossible');
});

test('borne le résumé Discord sans tronquer le diagnostic archivé', () => {
  const message = 'x'.repeat(5000);
  const result = normalise({ execution: { id: '42', error: { message } }, workflow: { name: 'w'.repeat(3000) } });
  assert.ok(result.alert_message.length <= 2000);
  assert.ok(result.alert_message.includes('42'));
  assert.equal(result.error_message, message);
  assert.equal(result.payload_snapshot.execution.error.message.length, 5000);
});
