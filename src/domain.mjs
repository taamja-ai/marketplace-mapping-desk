export const REQUEST_TYPE = "mapping_correction";

export const STATES = Object.freeze({
  SUBMITTED: "submitted",
  AWAITING_EVIDENCE: "awaiting_evidence",
  APPROVED: "approved",
  NEEDS_RECONCILIATION: "needs_reconciliation",
  RESOLVED: "resolved",
  REJECTED: "rejected",
});

export const ROLES = Object.freeze({
  SELLER_SUPPORT: "seller_support",
  LISTING_OPERATIONS: "listing_operations",
  ENGINEERING: "engineering",
});

export const ACTIONS = Object.freeze({
  REQUEST_EVIDENCE: "request_evidence",
  ADD_EVIDENCE: "add_evidence",
  APPROVE: "approve",
  REJECT: "reject",
  APPLY: "apply",
  ESCALATE: "escalate",
});

export const SIMULATED_OUTCOMES = Object.freeze({
  VERIFIED_SUCCESS: "verified_success",
  AMBIGUOUS_TIMEOUT: "ambiguous_timeout",
});

export const EVENT_TYPES = Object.freeze({
  REQUEST_SUBMITTED: "request_submitted",
  EVIDENCE_REQUESTED: "evidence_requested",
  EVIDENCE_ADDED: "evidence_added",
  MAPPING_APPROVED: "mapping_approved",
  REQUEST_REJECTED: "request_rejected",
  APPLICATION_ATTEMPTED: "application_attempted",
  APPLICATION_VERIFIED: "application_verified",
  APPLICATION_OUTCOME_UNKNOWN: "application_outcome_unknown",
  RECONCILIATION_ESCALATED: "reconciliation_escalated",
});

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

const REQUIRED_INPUT_FIELDS = [
  "sellerId",
  "sellerSku",
  "marketplace",
  "proposedCatalogId",
  "reason",
  "evidence",
];

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError("INVALID_INPUT", `${field} is required`);
  }
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new DomainError("INVALID_INPUT", `${field} must be text`);
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function requireState(request, expected, action) {
  if (!request || request.status !== expected) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `${action} requires ${expected}, received ${request?.status ?? "missing request"}`,
    );
  }
}

function requireActor(actual, expected, action) {
  if (actual !== expected) {
    throw new DomainError(
      "INVALID_ACTOR",
      `${action} requires ${expected}, received ${actual ?? "missing actor"}`,
    );
  }
}

function event(type, actorRole, at, data = {}) {
  return { type, actorRole, at, data };
}

function transitionResult(request, events) {
  return { request, events };
}

export function validateRequestInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("INVALID_INPUT", "request input must be an object");
  }

  const requestType = input.requestType ?? REQUEST_TYPE;
  if (requestType !== REQUEST_TYPE) {
    throw new DomainError(
      "INVALID_INPUT",
      `requestType must be ${REQUEST_TYPE}`,
    );
  }

  const normalized = { requestType: REQUEST_TYPE };
  for (const field of REQUIRED_INPUT_FIELDS) {
    normalized[field] = requiredText(input[field], field);
  }
  normalized.currentCatalogId = optionalText(
    input.currentCatalogId,
    "currentCatalogId",
  );
  return normalized;
}

export function createRequest(input, context) {
  const normalized = validateRequestInput(input);
  const id = requiredText(context?.id, "id");
  const now = requiredText(context?.now, "now");
  const actorRole = context?.actorRole ?? ROLES.SELLER_SUPPORT;
  requireActor(actorRole, ROLES.SELLER_SUPPORT, "create request");

  const request = {
    id,
    ...normalized,
    status: STATES.SUBMITTED,
    nextOwner: ROLES.LISTING_OPERATIONS,
    approvedMapping: null,
    verification: null,
    lastOperationRef: null,
    createdAt: now,
    updatedAt: now,
  };

  return transitionResult(request, [
    event(EVENT_TYPES.REQUEST_SUBMITTED, actorRole, now, {
      requestType: REQUEST_TYPE,
    }),
  ]);
}

export function getAllowedActions(request) {
  if (!request) return [];
  switch (request.status) {
    case STATES.SUBMITTED:
      return [
        ACTIONS.REQUEST_EVIDENCE,
        ACTIONS.APPROVE,
        ACTIONS.REJECT,
      ];
    case STATES.AWAITING_EVIDENCE:
      return [ACTIONS.ADD_EVIDENCE];
    case STATES.APPROVED:
      return [ACTIONS.APPLY];
    case STATES.NEEDS_RECONCILIATION:
      return request.nextOwner === ROLES.LISTING_OPERATIONS
        ? [ACTIONS.ESCALATE]
        : [];
    default:
      return [];
  }
}

export function transitionRequest(request, action, payload = {}, context = {}) {
  if (!request || typeof request !== "object") {
    throw new DomainError("INVALID_INPUT", "request is required");
  }
  const now = requiredText(context.now, "now");
  const actorRole = context.actorRole;

  switch (action) {
    case ACTIONS.REQUEST_EVIDENCE: {
      requireState(request, STATES.SUBMITTED, action);
      requireActor(actorRole, ROLES.LISTING_OPERATIONS, action);
      const reason = requiredText(payload.reason, "reason");
      return transitionResult(
        {
          ...request,
          status: STATES.AWAITING_EVIDENCE,
          nextOwner: ROLES.SELLER_SUPPORT,
          updatedAt: now,
        },
        [event(EVENT_TYPES.EVIDENCE_REQUESTED, actorRole, now, { reason })],
      );
    }

    case ACTIONS.ADD_EVIDENCE: {
      requireState(request, STATES.AWAITING_EVIDENCE, action);
      requireActor(actorRole, ROLES.SELLER_SUPPORT, action);
      const evidence = requiredText(payload.evidence, "evidence");
      return transitionResult(
        {
          ...request,
          status: STATES.SUBMITTED,
          nextOwner: ROLES.LISTING_OPERATIONS,
          updatedAt: now,
        },
        [event(EVENT_TYPES.EVIDENCE_ADDED, actorRole, now, { evidence })],
      );
    }

    case ACTIONS.APPROVE: {
      requireState(request, STATES.SUBMITTED, action);
      requireActor(actorRole, ROLES.LISTING_OPERATIONS, action);
      const approvedMapping = {
        marketplace: request.marketplace,
        sellerSku: request.sellerSku,
        catalogId: request.proposedCatalogId,
      };
      return transitionResult(
        {
          ...request,
          status: STATES.APPROVED,
          nextOwner: ROLES.LISTING_OPERATIONS,
          approvedMapping,
          updatedAt: now,
        },
        [
          event(EVENT_TYPES.MAPPING_APPROVED, actorRole, now, {
            approvedMapping,
          }),
        ],
      );
    }

    case ACTIONS.REJECT: {
      requireState(request, STATES.SUBMITTED, action);
      requireActor(actorRole, ROLES.LISTING_OPERATIONS, action);
      const reason = requiredText(payload.reason, "reason");
      return transitionResult(
        {
          ...request,
          status: STATES.REJECTED,
          nextOwner: null,
          updatedAt: now,
        },
        [event(EVENT_TYPES.REQUEST_REJECTED, actorRole, now, { reason })],
      );
    }

    case ACTIONS.APPLY: {
      requireState(request, STATES.APPROVED, action);
      requireActor(actorRole, ROLES.LISTING_OPERATIONS, action);
      const operationRef = requiredText(payload.operationRef, "operationRef");
      const attempted = event(
        EVENT_TYPES.APPLICATION_ATTEMPTED,
        actorRole,
        now,
        { operationRef },
      );

      if (payload.outcome === SIMULATED_OUTCOMES.AMBIGUOUS_TIMEOUT) {
        return transitionResult(
          {
            ...request,
            status: STATES.NEEDS_RECONCILIATION,
            nextOwner: ROLES.LISTING_OPERATIONS,
            lastOperationRef: operationRef,
            verification: null,
            updatedAt: now,
          },
          [
            attempted,
            event(EVENT_TYPES.APPLICATION_OUTCOME_UNKNOWN, actorRole, now, {
              operationRef,
            }),
          ],
        );
      }

      if (payload.outcome !== SIMULATED_OUTCOMES.VERIFIED_SUCCESS) {
        throw new DomainError(
          "UNSUPPORTED_OUTCOME",
          `unsupported simulated outcome: ${payload.outcome ?? "missing"}`,
        );
      }

      const verification = payload.verification;
      if (
        !verification ||
        verification.marketplace !== request.approvedMapping?.marketplace ||
        verification.sellerSku !== request.approvedMapping?.sellerSku ||
        verification.catalogId !== request.approvedMapping?.catalogId
      ) {
        throw new DomainError(
          "VERIFICATION_MISMATCH",
          "verification must match the exact approved mapping",
        );
      }

      const normalizedVerification = {
        operationRef,
        marketplace: verification.marketplace,
        sellerSku: verification.sellerSku,
        catalogId: verification.catalogId,
      };
      return transitionResult(
        {
          ...request,
          status: STATES.RESOLVED,
          nextOwner: null,
          lastOperationRef: operationRef,
          verification: normalizedVerification,
          updatedAt: now,
        },
        [
          attempted,
          event(EVENT_TYPES.APPLICATION_VERIFIED, actorRole, now, {
            verification: normalizedVerification,
          }),
        ],
      );
    }

    case ACTIONS.ESCALATE: {
      requireState(request, STATES.NEEDS_RECONCILIATION, action);
      requireActor(actorRole, ROLES.LISTING_OPERATIONS, action);
      if (request.nextOwner !== ROLES.LISTING_OPERATIONS) {
        throw new DomainError(
          "INVALID_TRANSITION",
          "reconciliation has already been escalated",
        );
      }
      const reason = requiredText(payload.reason, "reason");
      return transitionResult(
        {
          ...request,
          status: STATES.NEEDS_RECONCILIATION,
          nextOwner: ROLES.ENGINEERING,
          updatedAt: now,
        },
        [
          event(EVENT_TYPES.RECONCILIATION_ESCALATED, actorRole, now, {
            reason,
            operationRef: request.lastOperationRef,
            nextOwner: ROLES.ENGINEERING,
          }),
        ],
      );
    }

    default:
      throw new DomainError(
        "INVALID_TRANSITION",
        `unsupported action: ${action ?? "missing"}`,
      );
  }
}