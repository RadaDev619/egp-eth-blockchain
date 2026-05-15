# Architecture

## Purpose

The e-GP Trust Layer is a middleware trust and audit layer for procurement integrity. It does not replace Bhutan e-GP. It records role-verified procurement actions as backend-relayed Ethereum audit proofs.

## System Shape

```text
Existing e-GP or simulator
-> Trust Layer Backend
-> Ethereum Smart Contracts
-> Auditor Dashboard
```

The browser is a client. It displays identity, permissions, workflow state, blockchain proof, and audit evidence, but it does not decide identity, role, state, or transaction authority.

## Layers

### Frontend

Path: `/frontend`

Technology:

- Next.js 15
- React
- TypeScript
- TailwindCSS

Responsibilities:

- Mock Bhutan NDI login UI.
- Role-aware dashboard navigation.
- Tender create/amend UI.
- Bid submission UI.
- Evaluation and payment approval UI.
- Auditor timeline UI.
- Document verification UI.
- Clear blocked-action messages.

The frontend gets the current user and permissions from backend session APIs. Hidden or disabled UI controls are only a usability layer; backend enforcement remains authoritative.

### Backend

Path: `/backend`

Technology:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL

Responsibilities:

- Mock NDI proof request and completion.
- Employment ID extraction and backend role mapping.
- Salted employee hash creation.
- Session creation and auth middleware.
- RBAC middleware.
- Procurement state-machine validation.
- Append-only tender versions.
- Audit event creation for successful and blocked actions.
- Server-side document hashing and PDF validation.
- IPFS/mock storage integration.
- Fixed-method gasless relayer.

### Database

Prisma models include:

- `NDIProfile`
- `User`
- `AuthSession`
- `RolePermission`
- `Tender`
- `TenderVersion`
- `Bid`
- `Approval`
- `ProcurementTransition`
- `AuditLog`
- `BlockchainTransaction`
- `NDIProofRequest`

Audit logs are append-only by application design. Tender amendments create `TenderVersion` rows instead of overwriting old versions.

### Contracts

Path: `/contracts`

Technology:

- Solidity
- Hardhat
- ethers.js

Contracts:

- `RoleManager.sol`: authorizes backend relayer addresses.
- `TenderRegistry.sol`: records tender, version, and bid proof events.
- `ApprovalManager.sol`: records evaluation/payment approval and enforces payment after evaluation.
- `AuditLog.sol`: emits procurement audit and tampering events.

Contracts treat `msg.sender` as the backend relayer, not the real procurement actor. The actor is passed as metadata: `actorEmployeeHash` and `actorRole`.

### Scripts

Path: `/scripts`

`demo-db.mjs` powers:

- `npm run demo:seed`
- `npm run demo:reset`

It supplies safe local mock-mode defaults if environment variables are not set, then runs Prisma seed/reset commands.

## Identity Flow

```text
Mock Bhutan NDI
-> proofRequestThreadId
-> ProofValidated result
-> Employment ID, Position, Employer, Employment Type
-> backend role mapping
-> employeeHash
-> session
-> role permissions
```

Role mapping is deterministic for the MVP:

- `PROC-001` -> `PROCUREMENT_OFFICER`
- `VEND-001` -> `VENDOR`
- `EVAL-001` -> `EVALUATOR`
- `FIN-001` -> `FINANCE_OFFICER`
- `AUD-001` -> `AUDITOR`

Production NDI would require official verifier onboarding, real credential proof configuration, secure event delivery, and privacy/legal review.

## Procurement State Machine

Key states:

- `CREATED`
- `BID_SUBMITTED`
- `EVALUATION_APPROVED`
- `PAYMENT_APPROVED`
- `COMPLETED`
- `CANCELLED`

Key actions:

- `CREATE_TENDER`
- `SUBMIT_BID`
- `APPROVE_EVALUATION`
- `APPROVE_PAYMENT`
- `CREATE_TENDER_VERSION`
- `CANCEL_TENDER`
- `VERIFY_DOCUMENT`

The state machine blocks:

- Finance approval before evaluation approval.
- Vendor payment approval.
- Auditor mutation.
- Procurement officer payment approval.
- Silent tender overwrite.
- Normal approvals after cancellation.

## Relayer Flow

```text
Business API
-> authMiddleware
-> requirePermission
-> procurementStateMachine
-> Prisma transaction
-> relayer fixed method
-> BlockchainTransaction
-> AuditLog txHash/status
```

Supported modes:

- `mock`: deterministic mock tx hashes.
- `local`: local Hardhat network.
- `sepolia`: Sepolia testnet.

There is no generic `/relayer/call-contract` endpoint.

## API Surface

Auth:

- `GET /auth/demo-profiles`
- `POST /auth/login`
- `POST /auth/ndi/start`
- `POST /auth/ndi/mock-complete`
- `GET /auth/session`
- `GET /auth/me`
- `GET /auth/permissions`
- `POST /auth/logout`

Procurement:

- `POST /tender/create`
- `POST /tender/amend`
- `GET /tenders`
- `GET /tenders/:id`
- `POST /bid/submit`
- `POST /approve/evaluation`
- `POST /approve/payment`
- `POST /verify/document`
- `POST /egp/event`

Audit:

- `GET /audit/logs`
- `GET /audit/tender/:tenderId/timeline`
- `GET /audit/tx/:txHash`

Health:

- `GET /health`

## Trust Boundaries

- Browser to backend: untrusted client input.
- Backend auth/session: first trusted application boundary.
- Backend to database: transactional system of record.
- Backend to contracts: relayer-only blockchain proof boundary.
- Public audit timeline: safe audit projection using employeeHash, not raw Employment ID.

## Design Constraints

- No browser-side blockchain account connection.
- No frontend signing.
- No raw Employment ID on-chain.
- No editable audit history.
- No arbitrary relayer calls.
- No digital asset, governance, or finance module scope.
