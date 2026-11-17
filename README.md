# Marketplace Mapping Desk

Take-home assignment for an Outcome Engineer interview. The prompt was open: build the first useful version of a system that receives and processes operational requests. Submissions can be repeated or fail partway through, and the team needs a status it can trust plus enough history to see what happened.

I treated it as a marketplace listing problem. Seller Support submits a request to correct a seller SKU-to-catalog mapping. Listing Operations reviews that exact proposal. A request is acknowledged as soon as it is submitted, and it is marked resolved only after the approved mapping is verified. The costly mistake is telling someone the fix worked when it did not.

Live demo: [Submit a mapping correction](https://oei-candidate-r1409027586.onebrief-interviews.workers.dev/submit)

That URL is the interview deployment. It may not stay available. The home page is the same host with no path: two workspaces, Seller Support and Listing Operations. There is no login. Anyone who can open the app can use either role.

## Walk through the demo

Use two requests. The first shows a verified fix. The second shows a partial failure that must not be treated as success.

1. Open [Seller Support](https://oei-candidate-r1409027586.onebrief-interviews.workers.dev/submit). Submit a correction with a seller ID, seller SKU, marketplace, proposed catalog ID, reason, and evidence notes. Current catalog ID is optional.
2. The next page is receipt only. It records the request and shows its history. It does not mean the mapping was applied. Copy or bookmark this page. Its address is `/support/requests/<id>`. Seller Support has no queue, so this is the only way back to the request.
3. Open [Listing Operations](https://oei-candidate-r1409027586.onebrief-interviews.workers.dev/operator). The queue shows the SKU, proposed catalog ID, status, and who owns the next action.
4. Open the request. Approve the exact proposed mapping, or reject it with a reason. If you choose **Request evidence**, the operator page does not link back to Seller Support. Open the `/support/requests/<id>` address saved in step 2, or replace `/operator/` with `/support/` in the current address. Add the requested note and resubmit. The mapping fields stay unchanged, and the request returns to the Listing Operations queue.
5. After approval, apply the mapping with **Verified success**. The simulator is labeled as a demo control. There is no live marketplace call. The request can be resolved only after this outcome.
6. Submit a second request and approve it. This time apply it with **Ambiguous timeout**. The request moves to reconciliation. Timeout is not success and not failure, and the app does not retry it.
7. Escalate that request to Engineering with a reason. The history on the request shows each step, who acted, and the next owner. No further Listing Operations action is available once it is escalated.

## What I built

Seller Support and Listing Operations are separate labeled views.

Support submits a correction and, when asked, adds evidence. Operations requests evidence, rejects, approves, applies the approved mapping, or escalates an unresolved result. Every request shows its status, the next owner, and an append-only history.

Applying the mapping is a separate step after approval. It runs a labeled simulator with two outcomes: verified success, and an ambiguous timeout. A timeout never counts as success or failure. The operator then escalates it by hand. I left out a real marketplace integration, production authentication, extra request types, attachments, duplicate handling, automatic retry, and a general workflow engine. Ambiguous cases go to Engineering manually.

The release stops fitting when volume or repeated submissions create a backlog, or when a reliable marketplace lookup and idempotent apply make that manual reconciliation unnecessary.

## How I approached it

I put accuracy ahead of speed. Fast acknowledgment and fast completion are different promises. The system may promise that a request was received. It may not promise that the catalog mapping changed until that result has been verified. The cost is slower completion and more operator work on uncertain cases.

I kept the implementation small: a plain JavaScript Cloudflare Worker, server-rendered HTML, D1 tables for current state and append-only history, native ES modules, and Node's built-in test runner. Domain, storage, and UI are separate. There is no framework and no build step.

I considered TypeScript with a lightweight router and generated binding types. The compile-time checks were real, and so was the setup cost. For this release the operational demonstration mattered more than the toolchain, so I stayed with plain JavaScript.

## Assignment

This is the prompt I was given.

Build the first useful version of a system for receiving and processing operational requests.

Choose one request type, its submitters, and the operators responsible for the outcome. Fast acknowledgment and fast completion may require different guarantees. Decide which mistake would be most costly in your context and what the system is allowed to promise at each point in the workflow.

People submit requests and operators move them through an operational process. Submissions or processing attempts may be repeated, retried, or fail partway through. The team needs trustworthy status and enough history to diagnose what happened.

Choose the boundary between automated behavior and operator judgment. Deliver a useful release and demonstrate one repeated or partially failed request, including how an operator decides what to do next. A simulated external step is acceptable if it is clearly identified. Explain the reliability or operational cost you accepted to keep the release small, and when that choice would stop being appropriate.

## Run locally

```sh
npx --yes wrangler@4.110.0 dev
```

Tests:

```sh
node --test
```

Local Wrangler simulates the D1 database. The schema is created by the application on startup. No Cloudflare account is required to run it locally.
