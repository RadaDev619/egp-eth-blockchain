# Demo Guide

## Core Message

The e-GP Trust Layer does not replace Bhutan e-GP. It adds a blockchain-backed trust and audit middleware layer that uses mock Bhutan NDI employment identity, backend RBAC, procurement state-machine enforcement, gasless Ethereum relayer proofs, and immutable audit logs to prevent hidden procurement manipulation.

## Recommended Demo Mode

Use mock mode for judging reliability:

```text
NDI_MODE=mock
BLOCKCHAIN_MODE=mock
IPFS_MODE=mock
```

Mock mode still proves the trust flow:

- Employment identity maps to role.
- Backend enforces permissions.
- Backend enforces workflow order.
- Blocked attempts are visible.
- Valid actions receive deterministic tx hashes.

Use local or Sepolia mode only if setup, funding, RPC, and confirmation time are stable.

## Reset Before Judging

Start PostgreSQL and confirm `DATABASE_URL` is reachable.

Then run:

```bash
npm run prisma:generate
npm run demo:reset
```

Expected deterministic baseline:

- Tender: `TDR-DEMO-001`
- Personas: `PROC-001`, `VEND-001`, `EVAL-001`, `FIN-001`, `AUD-001`
- Preloaded evidence: tender created, finance-before-evaluation blocked, vendor payment approval blocked

If the database command fails, start PostgreSQL or update `DATABASE_URL`.

## Start The App

Backend:

```bash
npm --workspace backend run dev
```

Frontend:

```bash
npm --workspace frontend run dev
```

Open:

```text
http://localhost:3000
```

## Golden Demo Flow

### 1. Login As Procurement Officer

Persona:

```text
PROC-001
```

Show:

- Login with Bhutan NDI.
- Mock NDI demo profile.
- Employment ID mapped to `PROCUREMENT_OFFICER`.
- Create tender action available.

Say:

"Role is not selected manually. It comes from employment identity mapping in the backend."

### 2. Create Tender

Create a tender with a PDF document.

Show:

- State `CREATED`.
- Version `v1`.
- Server-computed document hash.
- Mock CID or IPFS CID.
- Backend relayer proof tx hash.
- Audit event `TENDER_CREATED`.

Say:

"The tender is recorded as an append-only procurement event."

### 3. Login As Vendor

Persona:

```text
VEND-001
```

Submit a bid.

Show:

- State `BID_SUBMITTED`.
- Audit event `BID_SUBMITTED`.
- tx hash in mock/local/Sepolia mode.

### 4. Login As Finance Officer Too Early

Persona:

```text
FIN-001
```

Attempt payment approval before evaluation approval.

Expected:

- Request is blocked.
- UI shows blocked alert.
- Backend returns invalid workflow transition.
- Audit event `INVALID_TRANSITION_ATTEMPTED`.
- No successful payment blockchain proof is created.

Say:

"Even the finance role cannot bypass the required evaluation step."

### 5. Login As Evaluator

Persona:

```text
EVAL-001
```

Approve evaluation.

Show:

- State `EVALUATION_APPROVED`.
- Audit event `EVALUATION_APPROVED`.
- tx hash.

### 6. Login As Finance Officer Again

Persona:

```text
FIN-001
```

Approve payment.

Show:

- State `PAYMENT_APPROVED`.
- Audit event `PAYMENT_APPROVED`.
- tx hash.
- Blockchain status.

### 7. Login As Vendor And Attempt Payment Approval

Persona:

```text
VEND-001
```

Attempt payment approval.

Expected:

- Request is blocked.
- Backend returns authorization failure.
- Audit event `UNAUTHORIZED_ACTION_ATTEMPTED`.
- No successful payment blockchain proof is created.

Say:

"Wrong roles cannot perform restricted procurement actions."

### 8. Login As Auditor

Persona:

```text
AUD-001
```

Open audit timeline.

Show:

- Chronological successful events.
- Blocked finance-before-evaluation attempt.
- Blocked vendor payment approval attempt.
- Actor role.
- employeeHash short form.
- State changes.
- Rejection reasons.
- tx hashes.
- Blockchain status.

Say:

"The auditor can see both valid actions and failed manipulation attempts."

### 9. Document Verification

Open `/verify`.

Upload the expected document if available, then upload a modified PDF.

Show:

- Expected hash.
- Uploaded hash.
- Verification failed result.
- `TAMPERING DETECTED` alert.
- Tampering audit event.

## Five-Minute Pitch Script

Opening:

"Procurement systems depend heavily on trust. If a privileged actor can secretly edit records or bypass approvals, the audit trail becomes weak."

Problem:

"Existing centralized systems can record logs, but administrators or internal processes may still control the database."

Solution:

"Our e-GP Trust Layer adds blockchain-backed audit middleware. It does not replace e-GP. It verifies who is acting through mock Bhutan NDI, maps employment identity to a backend role, enforces procurement workflow rules, and records critical actions as gasless Ethereum relayer proofs."

Demo:

"First, a procurement officer creates a tender. Then a vendor submits a bid. If finance tries to approve payment before evaluation, the system blocks and logs the attempt. After evaluation approval, finance can approve payment. Finally, the auditor sees the entire timeline, including blocked attempts and blockchain transaction hashes."

Closing:

"The result is procurement integrity middleware: identity-backed, role-enforced, and audit-ready."

## Fallbacks

If Sepolia fails:

- Use `BLOCKCHAIN_MODE=mock` or `BLOCKCHAIN_MODE=local`.
- Explain that the architecture supports Sepolia, but mock/local mode is used for demo reliability.

If IPFS fails:

- Use `IPFS_MODE=mock`.
- Show server-side document hash and mock CID.

If database reset fails:

- Start PostgreSQL.
- Confirm `DATABASE_URL`.
- Rerun `npm run demo:reset`.

If frontend demo flow fails:

- Use backend API tests and `/audit` page as proof.

## Screenshot Checklist

- Mock NDI login page.
- Procurement Officer dashboard.
- Tender created with tx hash.
- Finance blocked before evaluation.
- Evaluation approved.
- Payment approved.
- Auditor timeline with blocked and successful events.
- Document verification tampering alert.
