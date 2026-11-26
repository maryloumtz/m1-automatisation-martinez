import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const [workflow] = JSON.parse(readFileSync(new URL('../workflow-audit-notification.json', import.meta.url)));
const prepareCode = workflow.nodes.find((node) => node.name === 'Preparer audit').parameters.jsCode;
const upsert = workflow.nodes.find((node) => node.name === 'Upsert audit').parameters;

function prepare(input) {
  return vm.runInNewContext(`(function () { ${prepareCode}\n })()`, {
    $input: { all: () => [{ json: input }] },
  })[0].json;
}
function body(input) {
  return vm.runInNewContext(`(${upsert.jsonBody.slice(3, -2)})`, { $json: prepare(input) });
}

test('un UUID vide ou absent devient null dans le corps envoyé à PostgreSQL', () => {
  for (const ticket_id of ['', '   ', null]) {
    assert.equal(body({ ticket_id, alert_message: '' }).ticket_id, null);
  }
  assert.equal(body({ ticket_id: '11111111-1111-4111-8111-111111111111' }).ticket_id,
    '11111111-1111-4111-8111-111111111111');
});

test('les détails JSON sont conservés et le message ne devient pas une colonne SQL', () => {
  const data = body({ idempotency_key: 'cle-test', workflow_name: 'test', ticket_id: '',
    statut: 'success', details: { priorite: 'critique', valeur: 42 }, alert_message: 'alerte' });
  assert.equal(data.details.priorite, 'critique');
  assert.equal(data.details.valeur, 42);
  assert.equal(Object.hasOwn(data, 'alert_message'), false);
  assert.equal(prepare({ alert_message: '   ' }).alert_message, '');
});

// Recette réseau volontaire, désactivée dans le test local ordinaire.
test('PostgREST met à jour la même ligne et accepte ticket_id null', {
  skip: process.env.RUN_POSTGREST_TEST !== '1',
}, async (t) => {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(base && key, 'URL et clé serveur requises');
  const idem = `recette-tp3:${crypto.randomUUID()}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
    Prefer: upsert.headerParameters.parameters.find((h) => h.name === 'Prefer').value };
  const url = vm.runInNewContext(`(${upsert.url.slice(3, -2)})`, { $env: { SUPABASE_URL: base } });
  let inserted = false;
  t.after(async () => {
    if (!inserted) return;
    const res = await fetch(`${base}/rest/v1/workflow_logs?idempotency_key=eq.${encodeURIComponent(idem)}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    assert.equal(res.status, 204, 'Nettoyage de la fixture de recette');
  });
  async function save(statut) {
    const data = body({ idempotency_key: idem, workflow_name: '[TEST] Recette TP3',
      ticket_id: '', statut, details: { recette: 'tp3' }, alert_message: '' });
    const res = await fetch(url, { method: upsert.method, headers, body: JSON.stringify(data) });
    assert.ok(res.ok, `Échec upsert HTTP ${res.status}`);
    inserted = true;
    return res.json();
  }
  const first = await save('processing');
  const second = await save('success');
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].statut, 'success');
  assert.equal(second[0].ticket_id, null);
  const res = await fetch(`${base}/rest/v1/workflow_logs?idempotency_key=eq.${encodeURIComponent(idem)}`, { headers });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).length, 1);
});
