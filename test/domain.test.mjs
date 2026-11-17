import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIONS,
  DomainError,
  EVENT_TYPES,
  REQUEST_TYPE,
  ROLES,
  SIMULATED_OUTCOMES,
  STATES,
  createRequest,
  getAllowedActions,
  transitionRequest,
  validateRequestInput,
} from "../src/domain.mjs";

const T0 = "2026-10-12T18:00:00.000Z";
const T1 = "2026-10-12T18:01:00.000Z";
const T2 = "2026-10-12T18:02:00.000Z";
const T3 = "2026-10-12T18:03:00.000Z";

const validInput = {
  requestType: REQUEST_TYPE,
  sellerId: "seller-123",
  sellerSku: "sku-blue-chair",
  marketplace: "Target",
  currentCatalogId: "  current-100  ",
  proposedCatalogId: "catalog-200",
  reason: "Current mapping points to the wrong product",
  evidence: "Seller supplied the catalog product URL",
};

function newRequest() {
  return createRequest(validInput, {
    id: "request-1",
    now: T0,
    actorRole: ROLES.SELLER_SUPPORT,
  }).request;
}

function approve(request = newRequest()) {
  return transitionRequest(
    request,
    ACTIONS.APPROVE,
    {},
    { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
  ).request;
}

function expectDomainError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

describe("mapping-correction request validation", () => {
  it("normalizes the fixed request shape", () => {
    const result = validateRequestInput(validInput);

    assert.equal(result.requestType, REQUEST_TYPE);
    assert.equal(result.currentCatalogId, "current-100");
    assert.equal(result.sellerSku, "sku-blue-chair");
  });

  it("allows currentCatalogId to be absent", () => {
    const result = validateRequestInput({
      ...validInput,
      currentCatalogId: "",
    });

    assert.equal(result.currentCatalogId, null);
  });

  it("rejects missing required fields and other request types", () => {
    expectDomainError(
      () => validateRequestInput({ ...validInput, evidence: "" }),
      "INVALID_INPUT",
    );
    expectDomainError(
      () => validateRequestInput({ ...validInput, requestType: "other" }),
      "INVALID_INPUT",
    );
  });
});

describe("request creation and review", () => {
  it("acknowledges receipt without implying resolution", () => {
    const { request, events } = createRequest(validInput, {
      id: "request-1",
      now: T0,
      actorRole: ROLES.SELLER_SUPPORT,
    });

    assert.equal(request.status, STATES.SUBMITTED);
    assert.equal(request.nextOwner, ROLES.LISTING_OPERATIONS);
    assert.equal(request.verification, null);
    assert.equal(events[0].type, EVENT_TYPES.REQUEST_SUBMITTED);
  });

  it("round-trips Awaiting Evidence back to Submitted with ordered events", () => {
    const requested = transitionRequest(
      newRequest(),
      ACTIONS.REQUEST_EVIDENCE,
      { reason: "Need a product URL" },
      { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
    );
    assert.equal(requested.request.status, STATES.AWAITING_EVIDENCE);
    assert.equal(requested.request.nextOwner, ROLES.SELLER_SUPPORT);
    assert.equal(requested.events[0].type, EVENT_TYPES.EVIDENCE_REQUESTED);

    const supplied = transitionRequest(
      requested.request,
      ACTIONS.ADD_EVIDENCE,
      { evidence: "Catalog URL and packaging photo description" },
      { now: T2, actorRole: ROLES.SELLER_SUPPORT },
    );
    assert.equal(supplied.request.status, STATES.SUBMITTED);
    assert.equal(supplied.request.nextOwner, ROLES.LISTING_OPERATIONS);
    assert.equal(supplied.events[0].type, EVENT_TYPES.EVIDENCE_ADDED);
  });

  it("records the exact approved mapping separately from an outcome", () => {
    const result = transitionRequest(
      newRequest(),
      ACTIONS.APPROVE,
      {},
      { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
    );

    assert.equal(result.request.status, STATES.APPROVED);
    assert.deepEqual(result.request.approvedMapping, {
      marketplace: "Target",
      sellerSku: "sku-blue-chair",
      catalogId: "catalog-200",
    });
    assert.equal(result.request.verification, null);
  });

  it("exposes only actions valid for the current state", () => {
    const submitted = newRequest();
    assert.deepEqual(getAllowedActions(submitted), [
      ACTIONS.REQUEST_EVIDENCE,
      ACTIONS.APPROVE,
      ACTIONS.REJECT,
    ]);

    const awaiting = transitionRequest(
      submitted,
      ACTIONS.REQUEST_EVIDENCE,
      { reason: "Need a product URL" },
      { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
    ).request;
    assert.deepEqual(getAllowedActions(awaiting), [ACTIONS.ADD_EVIDENCE]);
    assert.deepEqual(getAllowedActions(approve()), [ACTIONS.APPLY]);
  });

  it("records a reasoned rejection as a terminal outcome", () => {
    const result = transitionRequest(
      newRequest(),
      ACTIONS.REJECT,
      { reason: "Evidence points to a different catalog product" },
      { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
    );

    assert.equal(result.request.status, STATES.REJECTED);
    assert.equal(result.request.nextOwner, null);
    assert.equal(result.events[0].type, EVENT_TYPES.REQUEST_REJECTED);
    assert.deepEqual(getAllowedActions(result.request), []);
  });
  it("requires Listing Operations and a reason for rejection", () => {
    expectDomainError(
      () =>
        transitionRequest(
          newRequest(),
          ACTIONS.REJECT,
          { reason: "" },
          { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
        ),
      "INVALID_INPUT",
    );
    expectDomainError(
      () =>
        transitionRequest(
          newRequest(),
          ACTIONS.REJECT,
          { reason: "Conflicting evidence" },
          { now: T1, actorRole: ROLES.SELLER_SUPPORT },
        ),
      "INVALID_ACTOR",
    );
  });
});

describe("application outcomes and the resolved invariant", () => {
  it("resolves only when verification matches the exact approved mapping", () => {
    const approved = approve();
    const result = transitionRequest(
      approved,
      ACTIONS.APPLY,
      {
        operationRef: "operation-success",
        outcome: SIMULATED_OUTCOMES.VERIFIED_SUCCESS,
        verification: {
          marketplace: "Target",
          sellerSku: "sku-blue-chair",
          catalogId: "catalog-200",
        },
      },
      { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
    );

    assert.equal(result.request.status, STATES.RESOLVED);
    assert.equal(result.request.nextOwner, null);
    assert.equal(result.events[1].type, EVENT_TYPES.APPLICATION_VERIFIED);
  });

  it("rejects mismatched verification and does not mutate the approved request", () => {
    const approved = approve();

    expectDomainError(
      () =>
        transitionRequest(
          approved,
          ACTIONS.APPLY,
          {
            operationRef: "operation-mismatch",
            outcome: SIMULATED_OUTCOMES.VERIFIED_SUCCESS,
            verification: {
              marketplace: "Target",
              sellerSku: "sku-blue-chair",
              catalogId: "different-catalog",
            },
          },
          { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
        ),
      "VERIFICATION_MISMATCH",
    );

    assert.equal(approved.status, STATES.APPROVED);
    assert.equal(approved.verification, null);
  });

  it("ambiguous timeout cannot resolve without matching verification evidence", () => {
    const approved = approve();
    const result = transitionRequest(
      approved,
      ACTIONS.APPLY,
      {
        operationRef: "operation-timeout",
        outcome: SIMULATED_OUTCOMES.AMBIGUOUS_TIMEOUT,
      },
      { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
    );

    assert.equal(result.request.status, STATES.NEEDS_RECONCILIATION);
    assert.equal(result.request.nextOwner, ROLES.LISTING_OPERATIONS);
    assert.equal(result.request.verification, null);
    assert.deepEqual(
      result.events.map((entry) => entry.type),
      [
        EVENT_TYPES.APPLICATION_ATTEMPTED,
        EVENT_TYPES.APPLICATION_OUTCOME_UNKNOWN,
      ],
    );
    assert.ok(
      result.events.every((entry) => entry.type !== EVENT_TYPES.APPLICATION_VERIFIED),
    );
    assert.ok(!getAllowedActions(result.request).includes("resolve"));
  });

  it("does not allow Apply before approval or any direct resolve action", () => {
    expectDomainError(
      () =>
        transitionRequest(
          newRequest(),
          ACTIONS.APPLY,
          {
            operationRef: "operation-early",
            outcome: SIMULATED_OUTCOMES.AMBIGUOUS_TIMEOUT,
          },
          { now: T1, actorRole: ROLES.LISTING_OPERATIONS },
        ),
      "INVALID_TRANSITION",
    );
    expectDomainError(
      () =>
        transitionRequest(
          approve(),
          "resolve",
          {},
          { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
        ),
      "INVALID_TRANSITION",
    );
  });
});

describe("reconciliation escalation", () => {
  it("keeps an ambiguous request unresolved while assigning Engineering", () => {
    const timedOut = transitionRequest(
      approve(),
      ACTIONS.APPLY,
      {
        operationRef: "operation-timeout",
        outcome: SIMULATED_OUTCOMES.AMBIGUOUS_TIMEOUT,
      },
      { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
    ).request;

    const escalated = transitionRequest(
      timedOut,
      ACTIONS.ESCALATE,
      { reason: "Marketplace outcome needs investigation" },
      { now: T3, actorRole: ROLES.LISTING_OPERATIONS },
    );

    assert.equal(escalated.request.status, STATES.NEEDS_RECONCILIATION);
    assert.equal(escalated.request.nextOwner, ROLES.ENGINEERING);
    assert.equal(escalated.request.verification, null);
    assert.equal(
      escalated.events[0].type,
      EVENT_TYPES.RECONCILIATION_ESCALATED,
    );
    assert.deepEqual(getAllowedActions(escalated.request), []);
  });

  it("rejects a second escalation", () => {
    const timedOut = transitionRequest(
      approve(),
      ACTIONS.APPLY,
      {
        operationRef: "operation-timeout",
        outcome: SIMULATED_OUTCOMES.AMBIGUOUS_TIMEOUT,
      },
      { now: T2, actorRole: ROLES.LISTING_OPERATIONS },
    ).request;
    const escalated = transitionRequest(
      timedOut,
      ACTIONS.ESCALATE,
      { reason: "Needs investigation" },
      { now: T3, actorRole: ROLES.LISTING_OPERATIONS },
    ).request;

    expectDomainError(
      () =>
        transitionRequest(
          escalated,
          ACTIONS.ESCALATE,
          { reason: "Escalate again" },
          { now: T3, actorRole: ROLES.LISTING_OPERATIONS },
        ),
      "INVALID_TRANSITION",
    );
  });
});