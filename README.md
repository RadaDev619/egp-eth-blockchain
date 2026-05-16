# e-GP Trust Layer

Gasless Ethereum procurement audit and verification middleware for an e-GP-style workflow.

## Project Overview

The e-GP Trust Layer is a hackathon MVP that sits beside an existing or simulated procurement system. It verifies the actor through mock Bhutan NDI employment identity, maps the Employment ID to a backend role, enforces backend RBAC and procurement workflow rules, and records validated procurement actions as backend-relayed Ethereum audit proofs.

The reliable demo path uses mock mode: mock NDI, mock storage CIDs, and deterministic mock transaction hashes.

## Problem

Centralized procurement systems can suffer from hidden tender edits, approval-order bypass, weak audit trails, and limited independent verification. If a privileged actor can update procurement records or approve payment outside the required workflow, database logs alone may not be enough to prove integrity.

This MVP targets that exact failure mode: preventing hidden procurement manipulation by tying every critical action to verified employment identity, role authorization, workflow enforcement, immutable audit logs, and backend relayer proofs.

## Solution

This project adds a trust and audit middleware layer:

```text
Existing e-GP or simulator
-> Trust Layer Backend
-> Ethereum Contracts
-> Auditor Dashboard
```

The backend, not the browser, verifies identity, maps roles, checks permissions, validates state transitions, hashes documents, calls the relayer, and writes append-only audit evidence.

## What It Is Not

- Not a replacement for Bhutan e-GP.
- Not production-certified government infrastructure.
- Not a browser-side blockchain application.
- No frontend blockchain signing or account connection.
- No user-funded blockchain transactions.
- No digital asset, governance, or finance module.
- No raw Employment ID on-chain.

## Repository Structure

```text
/frontend   Next.js 15, React, TypeScript, TailwindCSS
/backend    Node.js, Express, TypeScript, Prisma, PostgreSQL
/contracts  Solidity, Hardhat, ethers.js
/scripts    Demo reset and utility scripts
/docs       Architecture, security, testing, and demo notes
```

## Architecture

Core layers:

- Frontend: demo dashboard, mock NDI login UI, procurement actions, audit timeline, document verification.
- Backend: Express APIs, session auth, RBAC middleware, procurement state machine, audit service, document hashing, IPFS/mock storage, relayer service.
- Database: Prisma models for NDI profiles, users, sessions, tenders, tender versions, bids, approvals, transitions, audit logs, blockchain transactions, and proof requests.
- Contracts: relayer-only Solidity contracts for roles, tender events, approval order, and audit events.
- Scripts: deterministic demo seed and reset commands.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Identity Flow

```text
Mock Bhutan NDI login
-> Employment ID
-> backend role mapping
-> backend permissions
-> procurement action
-> audit event
```

Demo personas:

- `PROC-001`: Procurement Officer, Ministry of Finance, role `PROCUREMENT_OFFICER`
- `VEND-001`: Vendor Representative, Demo Vendor Pvt Ltd, role `VENDOR`
- `APP-001`: Approving Officer, Ministry of Finance, role `APPROVING_OFFICER`
- `APP-002`: Second Approving Officer, Ministry of Finance, role `APPROVING_OFFICER`
- `TEC-001`: TEC Member, Technical Evaluation Committee, role `TEC_MEMBER`
- `TEC-CHAIR-001`: TEC Chairperson, Technical Evaluation Committee, role `TEC_CHAIR`
- `BANK-001`: Financial Institution Officer, Demo Bank, role `FINANCIAL_INSTITUTION_OFFICER`
- `EVAL-001`: Technical Evaluator, Evaluation Committee, role `EVALUATOR`
- `FIN-001`: Finance Officer, Ministry of Finance, role `FINANCE_OFFICER`
- `AUD-001`: Auditor, Royal Audit Authority, role `AUDITOR`

Mock NDI is used for hackathon reliability. Production Bhutan NDI integration requires proper verifier onboarding, credentials, proof-request configuration, secure event handling, and privacy review.

## Gasless Relayer Flow

```text
Frontend request
-> backend auth
-> backend RBAC
-> procurement state-machine validation
-> database transaction and audit event
-> fixed backend relayer method
-> Ethereum proof or mock tx hash
-> audit timeline
```

Users never sign blockchain transactions. The relayer private key stays in backend environment variables. There is no generic relayer contract-call API.

## Setup

Prerequisites:

- Node.js 20.11 or newer
- npm
- PostgreSQL for backend database-backed demo runs
- Optional: a Sepolia RPC provider and funded testnet deployer/relayer keys

Install dependencies:

```bash
npm install
```

Copy environment templates:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp contracts/.env.example contracts/.env
```

On Windows PowerShell, use:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item contracts\.env.example contracts\.env
```

## Database Setup

Start PostgreSQL and set `DATABASE_URL` in `backend/.env`.

Default local demo URL:

```text
postgresql://egp:egp@localhost:5432/egp_trust?schema=public
```

Docker option:

```bash
npm run db:up
```

If Docker Desktop is not already running, open Docker Desktop first and rerun the command.

Generate Prisma client and apply schema:

```bash
npm run prisma:generate
npm --workspace backend run prisma:push
```

`prisma:push` skips client generation because the previous command already generated the client. This avoids Windows file-lock errors when a dev server is using Prisma.

Seed deterministic demo data:

```bash
npm run demo:seed
```

Reset before judging:

```bash
npm run demo:reset
```

Stop the local demo database when finished:

```bash
npm run db:down
```

`demo:reset` force-resets the Prisma schema and reseeds `TDR-DEMO-001`, mock NDI personas, role permissions, stakeholder assignments, manifest proofs, encrypted proposal envelopes, old-system simulator references, and sample blocked-access evidence.

## Run The App

Backend:

```bash
npm --workspace backend run dev
```

Frontend:

```bash
npm --workspace frontend run dev
```

Open `http://localhost:3000`.

## Hardhat Deployment

Compile and test contracts:

```bash
npm run build:contracts
npm run test:contracts
```

Local Hardhat chain:

```bash
npm --workspace contracts exec -- hardhat node
```

Deploy to local chain in another terminal:

```bash
npm --workspace contracts run deploy:local
```

The deployment script writes `contracts/deployments/local.json`. Copy deployed contract addresses into `backend/.env` for `BLOCKCHAIN_MODE=local`.

Use this mapping from the deployment artifact:

```text
contracts.roleManager.address -> ROLE_MANAGER_ADDRESS
contracts.tenderRegistry.address -> TENDER_REGISTRY_ADDRESS
contracts.approvalManager.address -> APPROVAL_MANAGER_ADDRESS
contracts.auditLog.address -> AUDIT_LOG_ADDRESS
```

For local mode, set `RELAYER_PRIVATE_KEY` in `backend/.env` to the private key for the relayer address authorized during deployment. If `RELAYER_ADDRESS` is not set in `contracts/.env`, the deploy script authorizes the deployer address as the relayer.

## Relayer Configuration

Backend relayer modes:

- `BLOCKCHAIN_MODE=mock`: no private key required; deterministic mock tx hashes.
- `BLOCKCHAIN_MODE=local`: uses local RPC, contract addresses, and `RELAYER_PRIVATE_KEY`.
- `BLOCKCHAIN_MODE=sepolia`: uses Sepolia RPC, contract addresses, and `RELAYER_PRIVATE_KEY`.

Required backend contract variables outside mock mode:

```text
LOCAL_RPC_URL=
SEPOLIA_RPC_URL=
RELAYER_PRIVATE_KEY=
TX_CONFIRMATIONS=1
ROLE_MANAGER_ADDRESS=
TENDER_REGISTRY_ADDRESS=
APPROVAL_MANAGER_ADDRESS=
AUDIT_LOG_ADDRESS=
```

Never commit real private keys or RPC secrets.

## Sepolia Deployment

Configure `contracts/.env`:

```text
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
RELAYER_ADDRESS=
ETHERSCAN_API_KEY=
```

Deploy:

```bash
npm --workspace contracts run deploy:sepolia
```

Then configure `backend/.env` with:

```text
BLOCKCHAIN_MODE=sepolia
SEPOLIA_RPC_URL=
RELAYER_PRIVATE_KEY=
TX_CONFIRMATIONS=1
ROLE_MANAGER_ADDRESS=
TENDER_REGISTRY_ADDRESS=
APPROVAL_MANAGER_ADDRESS=
AUDIT_LOG_ADDRESS=
ETHERSCAN_BASE_URL=https://sepolia.etherscan.io/tx/
```

Use mock mode as the fallback if Sepolia RPC access, funding, or confirmation time slows the demo.

## IPFS And Mock Storage

For reliable demos:

```text
IPFS_MODE=mock
```

Mock mode stores deterministic mock CIDs and server-computed document hashes.

Optional Pinata mode:

```text
IPFS_MODE=pinata
PINATA_JWT=
```

Public IPFS storage needs privacy review. Do not claim procurement documents are private on public IPFS unless production encryption and access controls are added.

## Environment Variables

Backend:

```text
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_URL=
JWT_SECRET=
EMPLOYEE_HASH_SALT=
NDI_MODE=mock
NDI_AUTH_BASE_URL=https://staging.bhutanndi.com
NDI_VERIFIER_BASE_URL=https://demo-client.bhutanndi.com
NDI_CLIENT_ID=
NDI_CLIENT_SECRET=
BLOCKCHAIN_MODE=mock
LOCAL_RPC_URL=http://127.0.0.1:8545
SEPOLIA_RPC_URL=
RELAYER_PRIVATE_KEY=
ETHERSCAN_BASE_URL=https://sepolia.etherscan.io/tx/
TX_CONFIRMATIONS=1
ROLE_MANAGER_ADDRESS=
TENDER_REGISTRY_ADDRESS=
APPROVAL_MANAGER_ADDRESS=
AUDIT_LOG_ADDRESS=
IPFS_MODE=mock
PINATA_JWT=
```

Frontend:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_APP_NAME=e-GP Trust Layer
```

Contracts:

```text
LOCAL_RPC_URL=http://127.0.0.1:8545
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
RELAYER_ADDRESS=
ETHERSCAN_API_KEY=
```

Use placeholders only in committed files.

## Demo Workflow

1. Run `npm run demo:reset` so `TDR-DEMO-001` starts from the secure-gateway judging baseline.
2. Login as `PROC-001` and show the tender manifest, version hash, document hash, old e-GP reference, and backend relayer proof.
3. Login as `VEND-001` and show that the submitted proposal package is committed as encrypted technical and financial envelopes, not readable frontend content.
4. Login as `TEC-001`, declare conflict status, and request the technical envelope key release.
5. Confirm technical access succeeds only for the committee role and produces key-release audit evidence.
6. Login as `BANK-001` before technical finalization and show financial key release is blocked.
7. Login as `TEC-CHAIR-001`, finalize the evaluation report, and show the report hash/proof.
8. Login as `BANK-001` again and show financial envelope access is now allowed after technical completion.
9. Login as `TEC-CHAIR-001` and submit the award recommendation.
10. Login as `APP-002` and approve the award so the threshold is met.
11. Open `/public-audit` or login as `AUD-001` and show successful events, blocked attempts, employee-hash short forms, timestamps, tx hashes, and public proof labels.
12. Use `/verify` to upload a changed PDF and show `TAMPERING DETECTED`.

See [docs/DEMO.md](docs/DEMO.md).

## Testing Commands

```bash
npm run typecheck
npm run lint
npm run test
npm --workspace frontend run build
npm --workspace frontend run test:e2e
npm run build:contracts
npm run test:contracts
```

See [docs/TESTING.md](docs/TESTING.md).

## Security Notes

- Frontend role input is never trusted.
- Protected routes use backend auth and RBAC middleware.
- Procurement state changes go through the backend state machine.
- Finance-before-evaluation returns a workflow rejection.
- Unauthorized role attempts return authorization rejection.
- Successful and blocked actions create audit records.
- Audit history has no update/delete routes.
- Raw Employment ID is not written on-chain.
- `employeeHash = SHA256(employmentId + EMPLOYEE_HASH_SALT)`.
- Blockchain writes use fixed backend relayer methods only.
- Document hash verification is computed server-side.

See [docs/SECURITY.md](docs/SECURITY.md).

## Limitations

- Mock NDI is used for hackathon reliability.
- Production Bhutan NDI requires official onboarding and verifier integration.
- Mock blockchain mode proves integration logic but does not submit real transactions.
- Local and Sepolia modes require deployed contracts and private-key configuration.
- Public IPFS/Pinata storage requires privacy and data classification review.
- This is not replacing Bhutan e-GP; it demonstrates a middleware trust layer.
- This is not a formal smart-contract audit or production security certification.

## Future Work

- Production Bhutan NDI verifier integration.
- Agency-managed role registry.
- Encrypted document storage and privacy-preserving CID handling.
- Formal smart contract audit.
- e-GP API integration instead of simulator-driven actions.
- Deployment automation for contract address synchronization.
- Advanced procurement analytics and public verification views.
