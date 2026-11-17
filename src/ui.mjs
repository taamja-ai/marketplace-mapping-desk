const STATUS = {
  submitted: {
    label: "Submitted",
    description: "Received and waiting for Listing Operations review.",
  },
  awaiting_evidence: {
    label: "Awaiting evidence",
    description: "Seller Support must add the information requested by Listing Operations.",
  },
  approved: {
    label: "Approved",
    description: "The exact proposed mapping is approved; no marketplace outcome is promised yet.",
  },
  needs_reconciliation: {
    label: "Needs reconciliation",
    description: "An application was attempted, but the marketplace outcome is not verified.",
  },
  resolved: {
    label: "Resolved",
    description: "Verification matches the exact mapping approved by Listing Operations.",
  },
  rejected: {
    label: "Rejected",
    description: "Listing Operations declined the correction and recorded a reason.",
  },
};

const OWNER = {
  seller_support: "Seller Support",
  listing_operations: "Marketplace Listing Operations",
  engineering: "Engineering",
};

const EVENT_LABEL = {
  request_submitted: "Request submitted",
  evidence_requested: "Additional evidence requested",
  evidence_added: "Evidence added",
  mapping_approved: "Mapping approved",
  request_rejected: "Request rejected",
  application_attempted: "Marketplace application attempted",
  application_verified: "Marketplace outcome verified",
  application_outcome_unknown: "Marketplace outcome unknown",
  reconciliation_escalated: "Reconciliation escalated",
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusMeta(status) {
  return STATUS[status] ?? {
    label: status,
    description: "Status meaning is unavailable.",
  };
}

function ownerLabel(owner) {
  return owner ? (OWNER[owner] ?? owner) : "No further owner";
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function layout({ title, role, body }) {
  const roleLabel = role ? `<span class="role">${escapeHtml(role)}</span>` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Marketplace Mapping Desk</title>
  <style>
    :root { color-scheme: light; --ink:#172033; --muted:#5d687c; --line:#d9dfeb; --soft:#f4f6fa; --blue:#2457d6; --blue-soft:#eaf0ff; --danger:#a12a2a; --success:#216e43; }
    * { box-sizing: border-box; }
    body { margin:0; background:#f8f9fc; color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    nav, main { width:min(1080px, calc(100% - 32px)); margin:0 auto; }
    nav { min-height:64px; display:flex; align-items:center; gap:22px; }
    nav strong { margin-right:auto; font-size:16px; }
    nav a { color:var(--muted); text-decoration:none; font-weight:600; }
    nav a:hover { color:var(--blue); }
    main { padding:34px 0 56px; }
    h1 { margin:0 0 8px; font-size:30px; line-height:1.2; }
    h2 { margin:0 0 14px; font-size:20px; }
    h3 { margin:0 0 8px; font-size:16px; }
    p { margin:0 0 14px; }
    .muted { color:var(--muted); }
    .role { padding:5px 10px; border-radius:999px; background:var(--blue-soft); color:var(--blue); font-size:12px; font-weight:700; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:18px; }
    .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:20px; }
    .card-link { display:block; color:inherit; text-decoration:none; }
    .card-link:hover { border-color:#9cb1e7; }
    .stack { display:grid; gap:16px; }
    .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    .split { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); gap:20px; align-items:start; }
    label { display:grid; gap:6px; font-weight:650; }
    input, select, textarea { width:100%; border:1px solid #b9c2d3; border-radius:8px; padding:10px 11px; color:var(--ink); background:#fff; font:inherit; }
    textarea { min-height:96px; resize:vertical; }
    input:focus, textarea:focus, select:focus { outline:3px solid #cddaff; border-color:var(--blue); }
    button, .button { border:0; border-radius:8px; padding:10px 15px; font:inherit; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; }
    button, .button.primary { color:#fff; background:var(--blue); }
    .button.secondary, button.secondary { color:var(--ink); background:#e9edf5; }
    button.danger { background:var(--danger); }
    .status { display:inline-flex; align-items:center; gap:7px; border-radius:999px; padding:6px 10px; background:var(--soft); font-weight:750; font-size:13px; }
    .status::before { content:""; width:8px; height:8px; border-radius:50%; background:#66738a; }
    .status.resolved::before { background:var(--success); }
    .status.needs_reconciliation::before, .status.awaiting_evidence::before { background:#ad6500; }
    .promise { border-left:4px solid var(--blue); padding:10px 14px; background:var(--blue-soft); margin:14px 0 18px; }
    dl { display:grid; grid-template-columns:150px minmax(0,1fr); gap:8px 14px; margin:0; }
    dt { color:var(--muted); }
    dd { margin:0; overflow-wrap:anywhere; }
    .timeline { list-style:none; padding:0; margin:0; display:grid; gap:0; }
    .timeline li { position:relative; padding:0 0 20px 26px; border-left:2px solid var(--line); margin-left:7px; }
    .timeline li:last-child { border-left-color:transparent; padding-bottom:0; }
    .timeline li::before { content:""; position:absolute; left:-7px; top:3px; width:12px; height:12px; border-radius:50%; background:var(--blue); border:3px solid #fff; }
    .event-meta { color:var(--muted); font-size:12px; }
    .event-data { margin-top:5px; font-size:13px; color:#3e4a60; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }
    .request-title { overflow-wrap:anywhere; word-break:break-word; }
    .empty { text-align:center; padding:44px 20px; }
    .notice { padding:12px 14px; border:1px solid var(--line); border-radius:8px; background:var(--soft); }
    .danger-text { color:var(--danger); }
    @media (max-width:760px) { .split { grid-template-columns:1fr; } dl { grid-template-columns:1fr; gap:2px; } dd { margin-bottom:8px; } nav { flex-wrap:wrap; padding:12px 0; } }
  </style>
</head>
<body>
  <header>
    <nav aria-label="Primary navigation">
      <strong>Marketplace Mapping Desk</strong>
      <a href="/submit">Seller Support</a>
      <a href="/operator">Listing Operations</a>
      ${roleLabel}
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function statusBlock(request) {
  const meta = statusMeta(request.status);
  return `
    <span class="status ${escapeHtml(request.status)}">${escapeHtml(meta.label)}</span>
    <div class="promise">
      <strong>What this status promises</strong><br>
      ${escapeHtml(meta.description)}
    </div>
    <p><strong>Next owner:</strong> ${escapeHtml(ownerLabel(request.nextOwner))}</p>`;
}

function requestFacts(request) {
  return `<dl>
    <dt>Request type</dt><dd>${escapeHtml(request.requestType)}</dd>
    <dt>Seller</dt><dd>${escapeHtml(request.sellerId)}</dd>
    <dt>Seller SKU</dt><dd>${escapeHtml(request.sellerSku)}</dd>
    <dt>Marketplace</dt><dd>${escapeHtml(request.marketplace)}</dd>
    <dt>Current mapping</dt><dd>${escapeHtml(request.currentCatalogId ?? "Not currently mapped")}</dd>
    <dt>Proposed mapping</dt><dd>${escapeHtml(request.proposedCatalogId)}</dd>
    <dt>Reason</dt><dd>${escapeHtml(request.reason)}</dd>
    <dt>Initial evidence</dt><dd>${escapeHtml(request.evidence)}</dd>
  </dl>`;
}

function eventData(data) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return "";
  return `<div class="event-data">${entries
    .map(([key, value]) => {
      const shown = typeof value === "object" ? JSON.stringify(value) : value;
      return `${escapeHtml(key)}: ${escapeHtml(shown)}`;
    })
    .join("\n")}</div>`;
}

function history(events) {
  if (!events.length) return `<p class="muted">No history recorded.</p>`;
  return `<ol class="timeline">${events
    .map(
      (entry) => `<li>
        <strong>${escapeHtml(EVENT_LABEL[entry.type] ?? entry.type)}</strong>
        <div class="event-meta">${escapeHtml(ownerLabel(entry.actorRole))} · ${escapeHtml(formatDate(entry.at))}</div>
        ${eventData(entry.data)}
      </li>`,
    )
    .join("")}</ol>`;
}

export function renderHome() {
  return layout({
    title: "Choose a workspace",
    body: `<h1>Marketplace mapping correction</h1>
      <p class="muted">Two labeled workspaces make ownership and next actions explicit. Authentication is intentionally outside this prototype.</p>
      <div class="grid">
        <a class="card card-link" href="/submit">
          <span class="role">Seller Support</span>
          <h2 style="margin-top:16px">Submit a correction</h2>
          <p>Record a seller SKU, proposed catalog mapping, reason, and evidence.</p>
        </a>
        <a class="card card-link" href="/operator">
          <span class="role">Listing Operations</span>
          <h2 style="margin-top:16px">Review requests</h2>
          <p>Inspect status and history, then request evidence, reject, or approve.</p>
        </a>
      </div>`,
  });
}

export function renderSubmitForm() {
  return layout({
    title: "Submit mapping correction",
    role: "Seller Support",
    body: `<div style="max-width:760px">
      <h1>Submit mapping correction</h1>
      <p class="muted">Submission acknowledges receipt only. Listing Operations must review the exact proposed mapping.</p>
      <form class="card stack" method="post" action="/support/requests">
        <input type="hidden" name="requestType" value="mapping_correction">
        <div class="grid">
          <label>Seller ID<input name="sellerId" required autocomplete="off"></label>
          <label>Seller SKU<input name="sellerSku" required autocomplete="off"></label>
          <label>Marketplace<input name="marketplace" required autocomplete="off"></label>
          <label>Current catalog ID <span class="muted">(optional)</span><input name="currentCatalogId" autocomplete="off"></label>
          <label>Proposed catalog ID<input name="proposedCatalogId" required autocomplete="off"></label>
        </div>
        <label>Reason for correction<textarea name="reason" required></textarea></label>
        <label>Evidence notes<textarea name="evidence" required></textarea></label>
        <div><button type="submit">Submit request</button></div>
      </form>
    </div>`,
  });
}

export function renderSupportRequest(details) {
  const { request, events } = details;
  const evidenceForm =
    request.status === "awaiting_evidence"
      ? `<section class="card">
          <h2>Add requested evidence</h2>
          <p class="muted">Adding a note returns the request to Listing Operations. Core mapping fields are not changed.</p>
          <form class="stack" method="post" action="/support/requests/${encodeURIComponent(request.id)}/evidence">
            <label>Evidence note<textarea name="evidence" required></textarea></label>
            <div><button type="submit">Add evidence and resubmit</button></div>
          </form>
        </section>`
      : `<div class="notice">No Seller Support action is available in this state.</div>`;

  return layout({
    title: `Request ${request.id}`,
    role: "Seller Support",
    body: `<div class="toolbar" style="margin-bottom:18px"><a class="button secondary" href="/submit">Submit another</a></div>
      <div class="split">
        <div class="stack">
          <section class="card">
            <h1>Request received</h1>
            <p class="muted">Reference ${escapeHtml(request.id)}</p>
            ${statusBlock(request)}
            ${requestFacts(request)}
          </section>
          ${evidenceForm}
        </div>
        <section class="card"><h2>Request history</h2>${history(events)}</section>
      </div>`,
  });
}

export function renderOperatorQueue(requests) {
  const cards = requests.length
    ? requests
        .map((request) => {
          const meta = statusMeta(request.status);
          return `<a class="card card-link" href="/operator/requests/${encodeURIComponent(request.id)}">
            <div class="toolbar" style="justify-content:space-between">
              <span class="status ${escapeHtml(request.status)}">${escapeHtml(meta.label)}</span>
              <span class="muted">${escapeHtml(formatDate(request.updatedAt))}</span>
            </div>
            <h2 class="request-title" style="margin-top:16px">${escapeHtml(request.sellerSku)} → ${escapeHtml(request.proposedCatalogId)}</h2>
            <p>${escapeHtml(request.sellerId)} · ${escapeHtml(request.marketplace)}</p>
            <p class="muted">Next owner: ${escapeHtml(ownerLabel(request.nextOwner))}</p>
          </a>`;
        })
        .join("")
    : `<div class="card empty"><h2>No requests yet</h2><p class="muted">Seller Support submissions will appear here.</p></div>`;

  return layout({
    title: "Operator queue",
    role: "Listing Operations",
    body: `<h1>Mapping-correction queue</h1>
      <p class="muted">Review current promises and open each request for its valid actions.</p>
      <div class="grid">${cards}</div>`,
  });
}

function submittedActions(request) {
  if (request.status !== "submitted") return "";
  const id = encodeURIComponent(request.id);
  return `<section class="card stack">
    <h2>Review decision</h2>
    <form class="stack" method="post" action="/operator/requests/${id}/request-evidence">
      <label>Why more evidence is needed<textarea name="reason" required></textarea></label>
      <div><button class="secondary" type="submit">Request evidence</button></div>
    </form>
    <hr style="border:0;border-top:1px solid var(--line);width:100%">
    <form method="post" action="/operator/requests/${id}/approve">
      <button type="submit">Approve exact proposed mapping</button>
    </form>
    <form class="stack" method="post" action="/operator/requests/${id}/reject">
      <label>Rejection reason<textarea name="reason" required></textarea></label>
      <div><button class="danger" type="submit">Reject request</button></div>
    </form>
  </section>`;
}

function approvedAction(request) {
  if (request.status !== "approved") return "";
  const id = encodeURIComponent(request.id);
  return `<section class="card stack">
    <h2>Simulated marketplace application</h2>
    <div class="notice">
      <strong>Demo control — no real marketplace call</strong><br>
      Select the deterministic simulator outcome used when Apply runs.
    </div>
    <form class="stack" method="post" action="/operator/requests/${id}/apply">
      <label>Simulated marketplace outcome
        <select name="outcome" required>
          <option value="verified_success">Verified success</option>
          <option value="ambiguous_timeout">Ambiguous timeout</option>
        </select>
      </label>
      <div><button type="submit">Apply simulated mapping</button></div>
    </form>
  </section>`;
}

function reconciliationAction(request) {
  if (request.status !== "needs_reconciliation") return "";
  if (request.nextOwner === "engineering") {
    return `<div class="notice"><strong>Escalated to Engineering</strong><br>The marketplace outcome remains unresolved. No retry or automatic reconciliation is available in this release.</div>`;
  }
  const id = encodeURIComponent(request.id);
  return `<section class="card stack">
    <h2>Escalate unresolved outcome</h2>
    <p class="muted">The simulator timed out. This does not prove success or failure, so blind retry is unavailable.</p>
    <form class="stack" method="post" action="/operator/requests/${id}/escalate">
      <label>Escalation reason<textarea name="reason" required></textarea></label>
      <div><button type="submit">Escalate to Engineering</button></div>
    </form>
  </section>`;
}
export function renderOperatorRequest(details) {
  const { request, events } = details;
  const noAction =
    !["submitted", "approved", "needs_reconciliation"].includes(request.status)
      ? `<div class="notice">No Listing Operations action is available in this state.</div>`
      : "";

  return layout({
    title: `Review ${request.id}`,
    role: "Listing Operations",
    body: `<div class="toolbar" style="margin-bottom:18px"><a class="button secondary" href="/operator">Back to queue</a></div>
      <div class="split">
        <div class="stack">
          <section class="card">
            <h1>Mapping-correction request</h1>
            <p class="muted">Reference ${escapeHtml(request.id)}</p>
            ${statusBlock(request)}
            ${requestFacts(request)}
          </section>
          ${submittedActions(request)}
          ${approvedAction(request)}
          ${reconciliationAction(request)}
          ${noAction}
        </div>
        <section class="card"><h2>Request history</h2>${history(events)}</section>
      </div>`,
  });
}

export function renderErrorPage(error, status = 400) {
  return {
    status,
    html: layout({
      title: "Request error",
      body: `<div class="card" style="max-width:720px">
        <h1>Unable to complete that action</h1>
        <p class="danger-text">${escapeHtml(error.message ?? "Unexpected error")}</p>
        <a class="button secondary" href="/">Return to the workspaces</a>
      </div>`,
    }),
  };
}