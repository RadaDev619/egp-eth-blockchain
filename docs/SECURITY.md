# Security

## Security Goal

The MVP is designed to prevent centralized or unauthorized procurement manipulation from being hidden. It must block unauthorized roles, block out-of-sequence approvals, preserve append-only history, and show successful and blocked attempts to auditors.

## Main Boundary

Never trust the frontend.

The backend is responsible for:

- Identity proof completion.
- Employment ID extraction.
- Role mapping.
- Permission checks.
- Procurement state-machine checks.
- Document hashing.
- Audit logging.
- Relayer submission.

The frontend may display state and call APIs, but it is not authoritative.

## Identity And Privacy

Mock Bhutan NDI is used for the hackathon demo. The mock flow simulates proof request creation, deep link/QR metadata, `ProofValidated` result, revealed employment attributes, and session creation.

Requested employment attributes:

- Employment ID
- Position
- Employer
- Employment Type

Salary is not requested or stored.

Raw Employment ID is used only for backend role mapping and session context. External audit correlation uses:

```text
employeeHash = SHA256(employmentId + EMPLOYEE_HASH_SALT)
```

Raw Employment ID must not be written on-chain.

## RBAC Controls

Roles:

- `PROCUREMENT_OFFICER`
- `VENDOR`
- `EVALUATOR`
- `FINANCE_OFFICER`
- `AUDITOR`

Permissions are explicit and role-scoped in backend code and seed data. Protected APIs use auth middleware and permission middleware. Frontend-submitted roles are ignored.

Expected blocked examples:

- Vendor cannot approve payment: authorization failure.
- Procurement officer cannot approve payment: authorization failure.
- Auditor cannot mutate procurement state: authorization failure.
- Finance cannot approve payment before evaluation: workflow failure.

## Workflow Controls

RBAC alone is not enough. The procurement state machine validates the current tender state and action.

Critical workflow rule:

```text
Payment approval requires evaluation approval first.
```

Invalid transitions return workflow errors and create blocked audit evidence. Successful state changes create transitions, approvals or versions, audit logs, and relayer proofs where applicable.

## Audit Log Controls

Audit logs are append-only by design:

- No update audit API.
- No delete audit API.
- Blocked attempts are logged.
- Invalid transitions are logged.
- Successful actions are logged.
- Blockchain txHash/status fields are stored for proof display.

Allowed post-event blockchain lifecycle updates should be limited to confirmation metadata such as tx hash, block number, and status. Actor, action, tender, state, and rejection fields should not be rewritten.

## Relayer Controls

The relayer is backend-only. Users never call contracts directly.

Rules:

- Private key only from environment variables.
- Never expose private key in API responses or logs.
- No generic relayer endpoint.
- Only fixed business methods are available:
  - `recordTenderCreated`
  - `recordTenderVersionCreated`
  - `recordBidSubmitted`
  - `recordEvaluationApproved`
  - `recordPaymentApproved`
  - `recordTamperingDetected`
- Relayer is called only after auth, RBAC, and state-machine validation.
- Failed RBAC or invalid workflow attempts must not create successful blockchain proof.

## Smart Contract Controls

Contracts enforce the backend relayer model:

- Only authorized relayer can write.
- Actor metadata is passed separately because `msg.sender` is the relayer.
- Payment approval requires evaluation approval first.
- Events include role and employeeHash metadata.
- Raw Employment ID is not emitted.

This is still a hackathon MVP and not a formal smart-contract audit.

## Document And IPFS Controls

Document verification is a supporting feature.

Backend controls:

- PDF upload validation.
- File size limit.
- Filename sanitization.
- Server-side SHA256 hashing.
- Hash comparison against stored tender version hash.
- Tampering audit event on mismatch.
- Optional relayer tampering event.

Do not trust frontend-provided hashes.

IPFS/mock modes:

- `IPFS_MODE=mock`: recommended for demo reliability.
- `IPFS_MODE=pinata`: optional public IPFS upload path.

Public IPFS storage needs privacy review. Production use should consider encryption, access control, retention policy, and data classification.

## Environment And Secret Handling

Do not commit real secrets.

Sensitive values:

- `JWT_SECRET`
- `EMPLOYEE_HASH_SALT`
- `NDI_CLIENT_SECRET`
- `RELAYER_PRIVATE_KEY`
- `DEPLOYER_PRIVATE_KEY`
- `PINATA_JWT`
- RPC provider secrets
- Database passwords

Committed `.env.example` files must use placeholders only.

## API Security Controls

Backend uses:

- Centralized error handling.
- Request ID middleware.
- Auth middleware.
- RBAC middleware.
- Schema-style validation in controllers/services.
- Helmet/CORS/rate limiting where configured.
- Multer upload limits for documents.

Production deployments should also add HTTPS-only cookies or hardened session storage, centralized logs, audit retention rules, and production-grade secret management.

## Honest Disclosure

This MVP:

- Uses mock NDI for reliability.
- Demonstrates local/mock/Sepolia-capable relayer architecture.
- Does not replace Bhutan e-GP.
- Does not prove production privacy for public IPFS.
- Is not production-certified government infrastructure.

## Security Checklist Before Demo

- Finance-before-evaluation is blocked and logged.
- Vendor payment approval is blocked and logged.
- Tender amendment creates a new version.
- Auditor sees successful and blocked events.
- txHash appears only for validated relayer actions.
- No browser-side blockchain signing flow exists.
- No frontend signing exists.
- No raw Employment ID appears in blockchain payloads.
- Private keys are absent from committed files.
- Demo reset works against a reachable database.
