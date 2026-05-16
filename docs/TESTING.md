# Testing

## Purpose

Tests prove the central claim: unauthorized actors cannot secretly edit procurement records, bypass approval order, or rewrite history.

## Commands

Full workspace:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Frontend:

```bash
npm --workspace frontend run typecheck
npm --workspace frontend run lint
npm --workspace frontend run test
npm --workspace frontend run build
npm --workspace frontend run test:e2e
```

Backend:

```bash
npm --workspace backend run typecheck
npm --workspace backend run lint
npm --workspace backend run test
npm run prisma:generate
```

Contracts:

```bash
npm run build:contracts
npm run test:contracts
```

Demo seed/reset:

```bash
npm run demo:seed
npm run demo:reset
```

`demo:seed` and `demo:reset` require PostgreSQL to be reachable through `DATABASE_URL`.

## Backend Coverage

Backend tests cover:

- Mock NDI login creates a session.
- Employment ID maps to the correct role.
- Frontend role input is ignored.
- Employee hash is salted.
- Procurement officer can create tender.
- Vendor cannot create tender.
- Vendor can submit bid.
- Evaluator can approve evaluation.
- Finance cannot approve before evaluation.
- Finance can approve after evaluation.
- Vendor cannot approve payment.
- Auditor cannot mutate procurement state.
- Blocked attempts create audit logs.
- Relayer is not called on invalid actions.
- Document hash verification detects tampering.

## Updated Secure Gateway Coverage

Phase 17 adds regression coverage for the updated secure-gateway claims:

| Claim | Coverage |
| --- | --- |
| Encrypted proposal upload | `frontend/tests/unit/proposalEncryption.test.ts`, `backend/tests/unit/proposalPackageService.test.ts` |
| No plaintext proposal storage | Proposal package, encrypted upload, and legacy e-GP adapter tests reject plaintext metadata and assert encrypted references only. |
| Financial envelope cannot decrypt early | `backend/tests/unit/financialEvaluationService.test.ts` blocks financial access before `FINANCIAL_EVALUATION`. |
| Key release policy checks | `backend/tests/unit/keyManagementService.test.ts` covers request/release success and denied premature policy access. |
| Tender-specific role checks | `backend/tests/unit/policyEngine.test.ts` and `backend/tests/unit/tenderAssignmentService.test.ts` prove active assignment is required. |
| Publication threshold approval | `backend/tests/unit/tenderManifestPublicationService.test.ts` publishes only after threshold approval and records no proof for blocked approval. |
| Award threshold approval | `backend/tests/unit/awardService.test.ts` keeps the tender at `AWARD_RECOMMENDED` until the approval threshold is met. |
| Public audit confidentiality | `backend/tests/unit/publicAuditRoutes.test.ts` verifies public APIs omit employee hashes, holder DIDs, private metadata, key material, and encrypted file references. |
| Relayer/proof not called on failed checks | Proposal, publication, key release, financial access, and award tests assert no blockchain proof rows or relayer calls are produced for blocked actions. |

## Contract Coverage

Contract tests cover:

- Only authorized relayer can write.
- Unauthorized address cannot write.
- Tender creation event emits expected metadata.
- Payment approval fails before evaluation approval.
- Payment approval succeeds after evaluation approval.
- Raw Employment ID is not emitted.
- Audit/tampering events use metadata hashes and employee hashes.

## Frontend Coverage

Frontend unit tests cover:

- Login with Bhutan NDI text appears.
- Mock NDI profiles appear.
- Role-based navigation works.
- Forbidden browser-chain connection language is absent from frontend source.
- Finance-before-evaluation blocked alert appears.
- Vendor payment approval blocked alert appears.
- Auditor timeline shows successful and blocked events.
- txHash renders in `BlockchainProofCard`.
- Document verification shows `TAMPERING DETECTED` on mismatch.

## Playwright E2E

The Playwright golden demo flow uses mocked backend API responses to verify the front-end runtime journey:

1. Login as procurement officer.
2. Create tender.
3. Login as vendor.
4. Submit bid.
5. Login as finance officer.
6. Attempt payment before evaluation and see blocked alert.
7. Login as evaluator.
8. Approve evaluation.
9. Login as finance officer.
10. Approve payment.
11. Login as vendor.
12. Trigger/observe unauthorized payment approval block.
13. Login as auditor.
14. See successful and blocked audit timeline with tx hash.

Run:

```bash
npm --workspace frontend run test:e2e
```

## Security Regression Checks

Recommended static checks:

```bash
rg "window\\.ethereum|ethereum\\.request|signer\\.sendTransaction|private key|client_secret|RELAYER_PRIVATE_KEY|JWT_SECRET|EMPLOYEE_HASH_SALT" frontend -S
rg "/relayer/call-contract|audit.*delete|delete.*audit" backend/src -S
```

The first command should not find frontend blockchain signing or secret exposure patterns. The second should not find arbitrary relayer calls or audit deletion APIs.

## Known Test Environment Notes

Next.js generates `.next/types` during build. Do not run `npm run typecheck` at the same time as `npm --workspace frontend run build`, because concurrent access can produce transient missing `.next/types` errors. Run them serially.

Demo seed/reset tests that touch Prisma require a running PostgreSQL database. Unit tests use mocks where practical and do not require a live database.

## Demo Readiness Criteria

Green readiness means:

- Frontend build passes.
- Backend tests pass.
- Contract tests pass.
- Playwright golden demo passes.
- Demo reset works against a reachable database.
- Finance-before-evaluation is blocked.
- Vendor payment approval is blocked.
- Auditor timeline shows both blocked and successful events.
- tx hashes appear for validated actions.
- No browser-side blockchain account or signing flow appears.
