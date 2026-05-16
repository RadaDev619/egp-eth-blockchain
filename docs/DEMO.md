# Demo Guide

## Core Message

This is a Bhutan e-GP trust layer middleware MVP. It does not replace Bhutan e-GP. It sits beside an existing or simulated procurement system and adds mock Bhutan NDI employment identity, backend tender-specific policy, encrypted proposal envelopes, selective key release, threshold approvals, backend gasless Ethereum relayer proofs, and privacy-safe immutable audit logs.

The Phase 18 demo now focuses on proposal confidentiality and public proof trails, not the older bid/payment-only flow.

## Recommended Demo Mode

Use mock mode for judging reliability:

```text
NDI_MODE=mock
BLOCKCHAIN_MODE=mock
IPFS_MODE=mock
```

Mock mode still proves the important control path:

- Roles come from backend-mapped employment identity.
- Tender-specific assignments are enforced by the backend.
- Proposal files are represented as encrypted references and hash commitments.
- Key release is blocked unless tender stage and role policy match.
- Valid actions receive deterministic backend relayer tx hashes.
- Public audit shows hashes and tx references without proposal contents.

## Demo Personas

The mock Bhutan NDI login page includes these deterministic profiles:

| Employment ID | Role | Demo purpose |
| --- | --- | --- |
| `PROC-001` | `PROCUREMENT_OFFICER` | Create manifest, request publication, manage simulator records, commit contract proofs |
| `APP-001` | `APPROVING_OFFICER` | Approve publication and first award approval |
| `APP-002` | `APPROVING_OFFICER` | Second award approval to meet threshold |
| `VEND-001` | `VENDOR` | Submit encrypted proposal package |
| `TEC-001` | `TEC_MEMBER` | Conflict declaration and technical envelope access |
| `TEC-CHAIR-001` | `TEC_CHAIR` | Finalize evaluation and submit award recommendation |
| `BANK-001` | `FINANCIAL_INSTITUTION_OFFICER` | Financial envelope key release after technical completion |
| `AUD-001` | `AUDITOR` | Full audit timeline and document verification |

Legacy baseline personas `EVAL-001` and `FIN-001` remain for the old payment-approval fallback flow.

## Reset Before Judging

Start PostgreSQL and confirm `DATABASE_URL` is reachable.

Then run:

```bash
npm run prisma:generate
npm run demo:reset
```

Expected deterministic secure-gateway seed:

- Tender: `TDR-DEMO-001`
- Seeded stage: `TECHNICAL_EVALUATION`
- Tender manifest and publication approval proofs
- Five encrypted proposal envelopes
- Old e-GP simulator records showing encrypted references only
- Approved technical key release for `TEC-001`
- Premature financial access remains blocked until evaluation finalization
- Award recommendation and one approval preloaded so `APP-002` can meet threshold quickly
- Public audit proofs with no raw Employment ID or proposal content

The seed is intentionally fast-forwarded to the confidentiality section of the demo because the current UI does not yet include a full tender-close operation screen. You can still create a fresh manifest and proposal package manually, but `TDR-DEMO-001` is the reliable judging path.

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

## Phase 18 Golden Demo Flow

### 1. Show The Trust Boundary

Open `/login`.

Show:

- Login with Bhutan NDI.
- Mock NDI demo profiles.
- Roles are displayed after backend session creation.

Say:

"The browser does not choose a role. Employment identity maps to a backend role and tender-specific assignment."

### 2. Procurement Officer Reviews Manifest Proofs

Login as:

```text
PROC-001
```

Open `/tenders`, then `TDR-DEMO-001`, then `/tenders/{id}/manifest`.

Show:

- Manifest hash.
- Publication threshold.
- Publication approvals.
- Backend relayer proof tx hash.

Say:

"The tender starts as a manifest commitment. Publication requires threshold approval before vendors can rely on it."

### 3. Vendor Submits Encrypted Structured Proposal

Login as:

```text
VEND-001
```

Open `/proposals/submit`.

Show:

- Five envelope types: eligibility, technical, financial, supporting documents, tender security.
- Storage references ending in `.enc`.
- No proposal content entered into the trust layer UI.

Use the seeded package or submit a package against a published/open tender when available.

Say:

"The trust layer commits encrypted envelope hashes. The old-system simulator stores encrypted references, not plaintext proposal documents."

### 4. Show Old e-GP Simulator References

Login as:

```text
PROC-001
```

Open `/tenders/{id}` for `TDR-DEMO-001`.

Show:

- Legacy e-GP simulator records.
- `ENCRYPTED_REFERENCE_ONLY`.
- Trust-layer tx hash references.

Say:

"This demonstrates integration without claiming production e-GP API access."

### 5. TEC Member Declares No Conflict

Login as:

```text
TEC-001
```

Open `/committee`.

Show:

- Assigned tender.
- Conflict declaration status.
- Active committee assignment.

Click `Declare No Conflict` if not already declared.

Say:

"Committee access is tender-specific and blocked when conflict policy is not satisfied."

### 6. TEC Member Opens Technical Envelope Only

Still as `TEC-001`, open `/kms-requests` or use `/committee`.

Show:

- Technical envelope metadata.
- Approved/requested technical key release.
- Financial envelope is not released in the technical stage.

Say:

"The technical evaluator can access only technical material. Financial proposal access is stage-gated."

### 7. Financial Envelope Early Access Is Blocked

Login as:

```text
BANK-001
```

Open `/kms-requests`, select `TDR-DEMO-001`, and load key requests.

Expected:

- Financial workspace locked.
- The UI explains that `FINANCIAL_EVALUATION` is required.
- Blocked access is logged.

Say:

"Even a financial role cannot open financial envelopes before technical evaluation completes."

### 8. TEC Chair Finalizes Evaluation

Login as:

```text
TEC-CHAIR-001
```

Open `/committee/evaluation`, select `TDR-DEMO-001`, and load reports.

Finalize the seeded report or submit and finalize a report hash.

Expected:

- Tender moves to `FINANCIAL_EVALUATION`.
- Evaluation report proof is recorded.

Say:

"The report content stays off-chain. The proof is a signed hash commitment."

### 9. Financial Role Releases Financial Envelope

Login as:

```text
BANK-001
```

Open `/kms-requests`, select `TDR-DEMO-001`, and load key requests again.

Expected:

- Financial evaluation workspace is available.
- Financial key release can be requested/released according to policy.
- Key release proof appears as backend relayer evidence.

### 10. TEC Chair Submits Award Recommendation

Login as:

```text
TEC-CHAIR-001
```

Open `/award`, select `TDR-DEMO-001`, and load the award workspace.

Submit or confirm an award recommendation hash.

Show:

- Recommendation hash.
- Backend relayer proof.
- Tender state `AWARD_RECOMMENDED`.

### 11. Approvers Meet Award Threshold

Login as:

```text
APP-002
```

Open `/award`, select `TDR-DEMO-001`, and approve the recommendation.

Expected:

- Approval count reaches threshold.
- Tender state becomes `AWARD_APPROVED`.
- Award approval proof is recorded.

### 12. Public Audit Portal

Open `/public-audit`.

Show:

- Tender manifest proof.
- Proposal package/envelope commitments.
- Evaluation report hash.
- Award recommendation and approval proofs.
- tx hashes and timestamps.

Say:

"The public audit view proves the sequence without exposing raw Employment IDs, proposal contents, decryption keys, or private metadata."

## Five-Minute Pitch Script

Opening:

"Procurement integrity is not only about preventing payment bypass. It is also about keeping proposal contents confidential until the correct stage while still proving every critical action happened."

Problem:

"A centralized procurement system can store documents and logs, but administrators or privileged actors may still control edits, timing, and access."

Solution:

"Our trust layer adds a backend-enforced control plane: mock Bhutan NDI employment identity, tender-specific assignments, encrypted proposal envelopes, selective key release, threshold approvals, and backend-relayed Ethereum proof events."

Demo:

"A tender manifest is committed and approved by threshold. A vendor submits an encrypted proposal package. The old-system simulator stores encrypted references only. Technical evaluators can open technical envelopes after conflict checks, while financial envelopes stay locked until technical evaluation completes. Award approval requires a threshold, and the public portal shows proof hashes without confidential content."

Closing:

"This is not replacing Bhutan e-GP. It is a trust layer that makes hidden manipulation and premature access visible and harder to execute."

## Fallback Baseline Flow

If the secure-gateway path is too long for the judging slot, use the old baseline flow:

1. Login as `PROC-001` and create a tender.
2. Login as `VEND-001` and submit a bid.
3. Login as `FIN-001` and attempt payment before evaluation.
4. Login as `EVAL-001` and approve evaluation.
5. Login as `FIN-001` and approve payment.
6. Login as `AUD-001` and show blocked plus successful events.
7. Use `/verify` to show `TAMPERING DETECTED`.

## Fallbacks

If Sepolia fails:

- Use `BLOCKCHAIN_MODE=mock` or `BLOCKCHAIN_MODE=local`.
- Explain that Sepolia is supported, but mock/local mode is used for demo reliability.

If IPFS fails:

- Use `IPFS_MODE=mock`.
- Show server-side hashes and mock CIDs.

If database reset fails:

- Start PostgreSQL.
- Confirm `DATABASE_URL`.
- Rerun `npm run demo:reset`.

## Screenshot Checklist

- Mock NDI profile list with secure-gateway personas.
- Manifest page with publication threshold proof.
- Proposal package page with five encrypted envelopes.
- Tender workspace old-system simulator records.
- Committee conflict declaration.
- KMS page showing financial envelope locked early.
- Evaluation report finalization.
- Award threshold approval.
- Public audit portal with privacy-safe proof trail.
