import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const inventoryPath = "config/evolution-phase-172-conversion-core-canonical-inventory.json";
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

test("conversion core defines one unique canonical owner per capability", () => {
  const ids = inventory.capabilities.map((capability) => capability.id);
  const frontendOwners = inventory.capabilities.map((capability) => capability.frontendOwner);
  const apiOwners = inventory.capabilities.map((capability) => capability.apiOwner);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(frontendOwners).size, frontendOwners.length);
  assert.equal(new Set(apiOwners).size, apiOwners.length);
  assert.equal(inventory.baseline.canonicalOwnerConflicts, 0);
});

test("every declared owner and contract evidence exists", () => {
  for (const capability of inventory.capabilities) {
    assert.equal(existsSync(capability.frontendOwner), true, capability.frontendOwner);
    assert.equal(existsSync(capability.apiOwner), true, capability.apiOwner);
    assert.ok(capability.contractEvidence.length > 0, capability.id);
    for (const evidence of capability.contractEvidence) {
      assert.equal(existsSync(evidence), true, evidence);
    }
  }
});

test("inventory never upgrades contract evidence into runtime homologation", () => {
  for (const capability of inventory.capabilities) {
    assert.equal(capability.status, "contract_verified_runtime_pending");
  }
  assert.equal(inventory.baseline.authenticatedRuntimeEvidenceComplete, false);
  assert.equal(inventory.baseline.moduleStatus, "inventory_complete_runtime_pending");
});

test("inventory is read-only and cannot release a package", () => {
  assert.equal(inventory.inventoryPolicy.noProductionMutation, true);
  assert.equal(inventory.databaseMutation, false);
  assert.equal(inventory.externalCall, false);
  assert.equal(inventory.buildExecuted, false);
  assert.equal(inventory.zipGenerated, false);
});
