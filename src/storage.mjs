import { createRequest, transitionRequest } from "./domain.mjs";

export class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export async function initializeSchema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        request_type TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        seller_sku TEXT NOT NULL,
        marketplace TEXT NOT NULL,
        current_catalog_id TEXT,
        proposed_catalog_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence TEXT NOT NULL,
        status TEXT NOT NULL,
        next_owner TEXT,
        approved_mapping_json TEXT,
        verification_json TEXT,
        last_operation_ref TEXT,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS request_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        type TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        FOREIGN KEY (request_id) REFERENCES requests(id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_requests_status_updated
      ON requests(status, updated_at DESC)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_request_events_request
      ON request_events(request_id, id)
    `),
  ]);
}

function parseJson(value) {
  return value ? JSON.parse(value) : null;
}

function requestFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestType: row.request_type,
    sellerId: row.seller_id,
    sellerSku: row.seller_sku,
    marketplace: row.marketplace,
    currentCatalogId: row.current_catalog_id,
    proposedCatalogId: row.proposed_catalog_id,
    reason: row.reason,
    evidence: row.evidence,
    status: row.status,
    nextOwner: row.next_owner,
    approvedMapping: parseJson(row.approved_mapping_json),
    verification: parseJson(row.verification_json),
    lastOperationRef: row.last_operation_ref,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventFromRow(row) {
  return {
    id: Number(row.id),
    requestId: row.request_id,
    type: row.type,
    actorRole: row.actor_role,
    at: row.occurred_at,
    data: parseJson(row.data_json) ?? {},
  };
}

function insertRequestStatement(db, request) {
  return db
    .prepare(`
      INSERT INTO requests (
        id, request_type, seller_id, seller_sku, marketplace,
        current_catalog_id, proposed_catalog_id, reason, evidence,
        status, next_owner, approved_mapping_json, verification_json,
        last_operation_ref, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      request.id,
      request.requestType,
      request.sellerId,
      request.sellerSku,
      request.marketplace,
      request.currentCatalogId,
      request.proposedCatalogId,
      request.reason,
      request.evidence,
      request.status,
      request.nextOwner,
      JSON.stringify(request.approvedMapping),
      JSON.stringify(request.verification),
      request.lastOperationRef,
      1,
      request.createdAt,
      request.updatedAt,
    );
}

function insertEventStatement(db, requestId, event) {
  return db
    .prepare(`
      INSERT INTO request_events (
        request_id, type, actor_role, occurred_at, data_json
      ) VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      requestId,
      event.type,
      event.actorRole,
      event.at,
      JSON.stringify(event.data ?? {}),
    );
}

function conditionalEventStatement(db, requestId, version, event) {
  return db
    .prepare(`
      INSERT INTO request_events (
        request_id, type, actor_role, occurred_at, data_json
      )
      SELECT ?, ?, ?, ?, ?
      FROM requests
      WHERE id = ? AND version = ?
    `)
    .bind(
      requestId,
      event.type,
      event.actorRole,
      event.at,
      JSON.stringify(event.data ?? {}),
      requestId,
      version,
    );
}

export async function createStoredRequest(db, input, context) {
  const result = createRequest(input, context);
  await db.batch([
    insertRequestStatement(db, result.request),
    ...result.events.map((entry) =>
      insertEventStatement(db, result.request.id, entry),
    ),
  ]);
  return getRequestDetails(db, result.request.id);
}

export async function listStoredRequests(db) {
  const { results } = await db
    .prepare(`
      SELECT *
      FROM requests
      ORDER BY updated_at DESC, id ASC
    `)
    .all();
  return results.map(requestFromRow);
}

export async function getStoredRequest(db, id) {
  const row = await db
    .prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first();
  return requestFromRow(row);
}

export async function getRequestDetails(db, id) {
  const request = await getStoredRequest(db, id);
  if (!request) return null;
  const { results } = await db
    .prepare(`
      SELECT *
      FROM request_events
      WHERE request_id = ?
      ORDER BY id ASC
    `)
    .bind(id)
    .all();
  return { request, events: results.map(eventFromRow) };
}

export async function applyStoredAction(db, id, action, payload, context) {
  const current = await getStoredRequest(db, id);
  if (!current) {
    throw new StorageError("NOT_FOUND", `request ${id} was not found`);
  }

  const result = transitionRequest(current, action, payload, context);
  const nextVersion = current.version + 1;
  const update = db
    .prepare(`
      UPDATE requests
      SET status = ?,
          next_owner = ?,
          approved_mapping_json = ?,
          verification_json = ?,
          last_operation_ref = ?,
          updated_at = ?,
          version = ?
      WHERE id = ? AND version = ?
    `)
    .bind(
      result.request.status,
      result.request.nextOwner,
      JSON.stringify(result.request.approvedMapping),
      JSON.stringify(result.request.verification),
      result.request.lastOperationRef,
      result.request.updatedAt,
      nextVersion,
      id,
      current.version,
    );

  const batchResults = await db.batch([
    update,
    ...result.events.map((entry) =>
      conditionalEventStatement(db, id, nextVersion, entry),
    ),
  ]);

  if (batchResults[0]?.meta?.changes !== 1) {
    throw new StorageError(
      "CONFLICT",
      "request changed while the action was being applied",
    );
  }

  return getRequestDetails(db, id);
}