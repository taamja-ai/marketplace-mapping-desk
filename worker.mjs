import {
  ACTIONS,
  DomainError,
  ROLES,
  SIMULATED_OUTCOMES,
} from "./src/domain.mjs";
import {
  StorageError,
  applyStoredAction,
  createStoredRequest,
  getRequestDetails,
  initializeSchema,
  listStoredRequests,
} from "./src/storage.mjs";
import {
  renderErrorPage,
  renderHome,
  renderOperatorQueue,
  renderOperatorRequest,
  renderSubmitForm,
  renderSupportRequest,
} from "./src/ui.mjs";

function json(data, status = 200) {
  return Response.json(data, { status });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function redirect(request, pathname) {
  return Response.redirect(new URL(pathname, request.url).toString(), 303);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new DomainError("INVALID_INPUT", "request body must be valid JSON");
  }
}

async function readForm(request) {
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function actorForAction(action) {
  return action === ACTIONS.ADD_EVIDENCE
    ? ROLES.SELLER_SUPPORT
    : ROLES.LISTING_OPERATIONS;
}

function simulatedApplicationPayload(details, outcome) {
  const operationRef = `sim-${crypto.randomUUID()}`;
  const payload = { operationRef, outcome };
  if (outcome === SIMULATED_OUTCOMES.VERIFIED_SUCCESS) {
    payload.verification = {
      marketplace: details.request.approvedMapping?.marketplace,
      sellerSku: details.request.approvedMapping?.sellerSku,
      catalogId: details.request.approvedMapping?.catalogId,
    };
  }
  return payload;
}
function statusForError(error) {
  if (error instanceof DomainError) {
    if (error.code === "INVALID_ACTOR") return 403;
    if (
      error.code === "INVALID_TRANSITION" ||
      error.code === "VERIFICATION_MISMATCH"
    ) {
      return 409;
    }
    return 400;
  }
  if (error instanceof StorageError) {
    return error.code === "NOT_FOUND" ? 404 : 409;
  }
  return 500;
}

function apiErrorResponse(error) {
  if (error instanceof DomainError || error instanceof StorageError) {
    return json(
      { error: error.code, message: error.message },
      statusForError(error),
    );
  }
  console.error(error);
  return json({ error: "INTERNAL_ERROR", message: "Unexpected error" }, 500);
}

function pageErrorResponse(error) {
  if (!(error instanceof DomainError) && !(error instanceof StorageError)) {
    console.error(error);
  }
  const status = statusForError(error);
  const page = renderErrorPage(
    status === 500 ? new Error("Unexpected error") : error,
    status,
  );
  return html(page.html, page.status);
}

async function handleApi(request, env, url) {
  await initializeSchema(env.DB);

  if (request.method === "POST" && url.pathname === "/api/requests") {
    const body = await readJson(request);
    const details = await createStoredRequest(env.DB, body, {
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
      actorRole: ROLES.SELLER_SUPPORT,
    });
    return json(details, 201);
  }

  if (request.method === "GET" && url.pathname === "/api/requests") {
    return json({ requests: await listStoredRequests(env.DB) });
  }

  const detailsMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (request.method === "GET" && detailsMatch) {
    const details = await getRequestDetails(env.DB, detailsMatch[1]);
    return details
      ? json(details)
      : json({ error: "NOT_FOUND", message: "Request was not found" }, 404);
  }

  const actionMatch = url.pathname.match(
    /^\/api\/requests\/([^/]+)\/actions$/,
  );
  if (request.method === "POST" && actionMatch) {
    const body = await readJson(request);
    const action = body.action;
    const payload =
      action === ACTIONS.APPLY
        ? simulatedApplicationPayload(
            await requireDetails(env, actionMatch[1]),
            body.payload?.outcome,
          )
        : body.payload ?? {};
    const details = await applyStoredAction(
      env.DB,
      actionMatch[1],
      action,
      payload,
      {
        now: new Date().toISOString(),
        actorRole: actorForAction(action),
      },
    );
    return json(details);
  }

  return json({ error: "NOT_FOUND", message: "API route was not found" }, 404);
}

async function requireDetails(env, id) {
  const details = await getRequestDetails(env.DB, id);
  if (!details) {
    throw new StorageError("NOT_FOUND", `request ${id} was not found`);
  }
  return details;
}

async function handlePage(request, env, url) {
  await initializeSchema(env.DB);

  if (request.method === "GET" && url.pathname === "/") {
    return html(renderHome());
  }

  if (request.method === "GET" && url.pathname === "/submit") {
    return html(renderSubmitForm());
  }

  if (request.method === "POST" && url.pathname === "/support/requests") {
    const form = await readForm(request);
    const details = await createStoredRequest(env.DB, form, {
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
      actorRole: ROLES.SELLER_SUPPORT,
    });
    return redirect(request, `/support/requests/${details.request.id}`);
  }

  const supportMatch = url.pathname.match(/^\/support\/requests\/([^/]+)$/);
  if (request.method === "GET" && supportMatch) {
    return html(renderSupportRequest(await requireDetails(env, supportMatch[1])));
  }

  const evidenceMatch = url.pathname.match(
    /^\/support\/requests\/([^/]+)\/evidence$/,
  );
  if (request.method === "POST" && evidenceMatch) {
    const form = await readForm(request);
    await applyStoredAction(
      env.DB,
      evidenceMatch[1],
      ACTIONS.ADD_EVIDENCE,
      { evidence: form.evidence },
      { now: new Date().toISOString(), actorRole: ROLES.SELLER_SUPPORT },
    );
    return redirect(request, `/support/requests/${evidenceMatch[1]}`);
  }

  if (request.method === "GET" && url.pathname === "/operator") {
    return html(renderOperatorQueue(await listStoredRequests(env.DB)));
  }

  const operatorMatch = url.pathname.match(/^\/operator\/requests\/([^/]+)$/);
  if (request.method === "GET" && operatorMatch) {
    return html(renderOperatorRequest(await requireDetails(env, operatorMatch[1])));
  }

  const requestEvidenceMatch = url.pathname.match(
    /^\/operator\/requests\/([^/]+)\/request-evidence$/,
  );
  if (request.method === "POST" && requestEvidenceMatch) {
    const form = await readForm(request);
    await applyStoredAction(
      env.DB,
      requestEvidenceMatch[1],
      ACTIONS.REQUEST_EVIDENCE,
      { reason: form.reason },
      { now: new Date().toISOString(), actorRole: ROLES.LISTING_OPERATIONS },
    );
    return redirect(request, `/operator/requests/${requestEvidenceMatch[1]}`);
  }

  const approveMatch = url.pathname.match(
    /^\/operator\/requests\/([^/]+)\/approve$/,
  );
  if (request.method === "POST" && approveMatch) {
    await applyStoredAction(env.DB, approveMatch[1], ACTIONS.APPROVE, {}, {
      now: new Date().toISOString(),
      actorRole: ROLES.LISTING_OPERATIONS,
    });
    return redirect(request, `/operator/requests/${approveMatch[1]}`);
  }

  const applyMatch = url.pathname.match(
    /^\/operator\/requests\/([^/]+)\/apply$/,
  );
  if (request.method === "POST" && applyMatch) {
    const form = await readForm(request);
    const details = await requireDetails(env, applyMatch[1]);
    await applyStoredAction(
      env.DB,
      applyMatch[1],
      ACTIONS.APPLY,
      simulatedApplicationPayload(details, form.outcome),
      { now: new Date().toISOString(), actorRole: ROLES.LISTING_OPERATIONS },
    );
    return redirect(request, `/operator/requests/${applyMatch[1]}`);
  }

  const escalateMatch = url.pathname.match(
    /^\/operator\/requests\/([^/]+)\/escalate$/,
  );
  if (request.method === "POST" && escalateMatch) {
    const form = await readForm(request);
    await applyStoredAction(
      env.DB,
      escalateMatch[1],
      ACTIONS.ESCALATE,
      { reason: form.reason },
      { now: new Date().toISOString(), actorRole: ROLES.LISTING_OPERATIONS },
    );
    return redirect(request, `/operator/requests/${escalateMatch[1]}`);
  }
  const rejectMatch = url.pathname.match(
    /^\/operator\/requests\/([^/]+)\/reject$/,
  );
  if (request.method === "POST" && rejectMatch) {
    const form = await readForm(request);
    await applyStoredAction(
      env.DB,
      rejectMatch[1],
      ACTIONS.REJECT,
      { reason: form.reason },
      { now: new Date().toISOString(), actorRole: ROLES.LISTING_OPERATIONS },
    );
    return redirect(request, `/operator/requests/${rejectMatch[1]}`);
  }

  return html(
    renderErrorPage(new Error("Page was not found"), 404).html,
    404,
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return url.pathname.startsWith("/api/")
        ? await handleApi(request, env, url)
        : await handlePage(request, env, url);
    } catch (error) {
      return url.pathname.startsWith("/api/")
        ? apiErrorResponse(error)
        : pageErrorResponse(error);
    }
  },
};