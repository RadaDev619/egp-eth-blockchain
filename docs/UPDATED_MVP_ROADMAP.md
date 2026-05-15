# Updated Secure Gateway MVP Roadmap

## Source

This roadmap is based on `eGP_Updated_Architecture_Detailed_MVP_Plan.docx`.

## Updated Product Direction

The updated MVP expands the current e-GP Trust Layer from a tender workflow audit demo into a secure procurement gateway that sits between an existing or simulated e-GP system and the trust layer.

The old e-GP system remains responsible for procurement screens, operational records, and encrypted file references. The trust layer adds mock Bhutan NDI identity, tender-specific policy, encrypted proposal envelopes, selective key release, threshold approvals, backend-relayed Ethereum proofs, and a privacy-safe audit portal.

## Baseline Preserved

The current MVP remains the working baseline:

- Mock Bhutan NDI login.
- Employment ID to role mapping.
- Backend RBAC.
- Procurement state-machine enforcement.
- Gasless relayer modes: mock, local, Sepolia.
- Append-only audit logs.
- Tender document hashing and tampering detection.
- Auditor timeline.

The updated MVP must preserve these security boundaries while adding the new encrypted proposal and approval features.

## Real vs Mock Boundaries

Real in the updated MVP:

- Backend policy enforcement.
- Tender-specific role assignment.
- AES-GCM proposal envelope encryption for demo files.
- Server-side hash commitments.
- Append-only audit logging.
- Threshold approval logic.
- Smart contract proof events.
- Backend-only relayer calls.

Mock or simulated in the updated MVP:

- Bhutan NDI production integration.
- Existing e-GP API integration.
- Production-grade KMS/HSM.
- Public IPFS privacy controls.

No production claim should be made for NDI, KMS, or old e-GP integration until official services are integrated.

## Phase Plan

### Phase 0: Baseline And Target Architecture

Goal: preserve the current MVP and document the new secure gateway target.

Deliverables:

- Working branch.
- Updated architecture, security, demo, and roadmap docs.
- Clear real/mock boundary.

### Phase 1: Data Model Expansion

Goal: add database structures for tender-specific roles, proposal envelopes, key release, committee workflow, and award approval.

Deliverables:

- Prisma enums for expanded roles and tender lifecycle states.
- Models for stakeholders, tender assignments, tender manifests, proposal packages, proposal envelopes, encrypted file references, key release policies, key release requests, conflict declarations, evaluation reports, award recommendations, award approvals, and public audit proofs.
- Seed data for a deterministic secure-gateway demo.

### Phase 2: Tender-Specific Policy Engine

Goal: replace global-only role checks with identity plus tender assignment plus stage-based policy checks.

Deliverables:

- `policyEngine` service.
- `tenderAssignmentService`.
- Tests proving tender-specific authorization and frontend role tampering rejection.

### Phase 3: Secure Procurement Gateway

Goal: create the backend boundary that validates identity, policy, tender stage, encryption/hash metadata, audit logging, and relayer calls before touching storage or blockchain.

Deliverables:

- `secureProcurementGateway` service.
- Gateway controller and route structure.
- No generic relayer endpoint.

### Phase 4: Tender Manifest And Publication Approval

Goal: change tender creation into a manifest commitment with threshold publication approval.

Deliverables:

- Tender manifest hash.
- `DRAFT -> PUBLICATION_PENDING -> PUBLISHED` workflow.
- Threshold publication approval.
- Audit and relayer proof for publication.

### Phase 5: Proposal Package And Envelope Model

Goal: replace simple bid hash submission with structured proposal envelopes.

Envelope types:

- Eligibility.
- Technical.
- Financial.
- Supporting documents.
- Tender security.

Deliverables:

- Proposal package APIs.
- Envelope records.
- Proposal manifest hash.
- Vendor proposal wizard.

### Phase 6: MVP Encryption

Goal: encrypt proposal files before storage.

Deliverables:

- Browser WebCrypto AES-GCM utility.
- Encrypted upload path.
- Encrypted file hash commitments.
- Tests proving plaintext proposal content is not stored in old-system simulation.

### Phase 7: MVP Key Management Service

Goal: release decryption keys only after identity, tender role, envelope type, and lifecycle stage checks pass.

Deliverables:

- `keyManagementService`.
- Key release policy and request records.
- Blocked premature financial-envelope access.
- Key release audit events.

### Phase 8: Contract Proof Expansion

Goal: add relayer-only proof events for the new lifecycle.

Proof events:

- Tender manifest committed.
- Tender published.
- Proposal package submitted.
- Proposal envelope committed.
- Tender closed.
- Key release logged.
- Evaluation report committed.
- Award recommended.
- Award approved.
- Contract hash committed.

### Phase 9: Relayer Expansion

Goal: expose only fixed backend relayer methods for the new proof events.

Deliverables:

- Mock tx hashes for new proof types.
- Local/Sepolia support preserved.
- Tests proving relayer is not called on failed policy checks.

### Phase 10: Lifecycle State Machine Upgrade

Goal: support the full procurement lifecycle.

States:

- `DRAFT`
- `PUBLICATION_PENDING`
- `PUBLISHED`
- `OPEN_FOR_PROPOSALS`
- `CLOSED`
- `TECHNICAL_EVALUATION`
- `FINANCIAL_EVALUATION`
- `AWARD_RECOMMENDED`
- `AWARD_APPROVED`
- `CONTRACT_SIGNED`
- `ARCHIVED`
- `CANCELLED`

Blocked actions:

- Proposal submission after close.
- Evaluation before close.
- Financial opening before technical completion.
- Award before recommendation.
- Award without threshold approvals.
- Direct archive before contract proof.
- Tender overwrite.

### Phase 11: Evaluation Committee Module

Goal: support committee assignment, conflict declaration, technical envelope access, and signed report hash submission.

Deliverables:

- Committee dashboard.
- Conflict declaration.
- Evaluation report hash.
- Chairperson finalization.

### Phase 12: Financial Evaluation And Selective Decryption

Goal: prove financial proposal confidentiality until the correct stage.

Deliverables:

- Financial envelope access screen.
- Premature financial access blocked and logged.
- Allowed financial key release after technical completion.

### Phase 13: Award Recommendation And Threshold Approval

Goal: prevent single-person award approval.

Deliverables:

- Award recommendation hash.
- Threshold award approval.
- Letter of Intent, Letter of Acceptance, and contract hash proofs.

### Phase 14: Public Audit Portal

Goal: show verifiable proof without exposing confidential proposal data.

Deliverables:

- Public audit page.
- Privacy-safe API.
- Timeline of hashes, timestamps, roles, and tx hashes.

### Phase 15: Existing e-GP Simulator Adapter

Goal: demonstrate old-system integration without claiming access to production e-GP APIs.

Deliverables:

- `legacyEgpAdapter`.
- Encrypted file references.
- Old-system operational records.
- Ethereum tx references.

### Phase 16: Frontend Workflow Redesign

Goal: update UI around tender manifests, proposal envelopes, committee evaluation, award approval, and public audit.

Deliverables:

- `/tenders/[id]`
- `/tenders/[id]/manifest`
- `/proposals/submit`
- `/proposals/[id]/envelopes`
- `/committee`
- `/committee/evaluation`
- `/award`
- `/public-audit`
- `/kms-requests`

### Phase 17: Testing Upgrade

Goal: prove the new security claims.

Tests must cover:

- Encrypted proposal upload.
- No plaintext proposal storage.
- Financial envelope cannot decrypt early.
- Key release policy checks.
- Tender-specific role checks.
- Publication threshold approval.
- Award threshold approval.
- Public audit confidentiality.
- Relayer not called on failed checks.

### Phase 18: Updated Demo Flow

Goal: replace the old golden demo with a secure proposal confidentiality and proof trail demo.

Flow:

1. Procurement Officer creates tender manifest.
2. Threshold approvers publish tender.
3. Vendor submits encrypted structured proposal.
4. Old-system simulator shows encrypted-only references.
5. Tender closes.
6. TEC member signs conflict declaration.
7. TEC member decrypts technical envelope only.
8. Financial envelope early access is blocked.
9. Technical evaluation completes.
10. Financial role decrypts financial envelope.
11. TEC Chair submits recommendation hash.
12. Approvers approve award by threshold.
13. Public audit portal shows privacy-safe proof trail.

### Phase 19: Documentation And Pitch Update

Goal: align all docs with the updated MVP.

Required disclosures:

- Mock Bhutan NDI.
- Simulated old e-GP integration.
- Real MVP encryption.
- MVP/local KMS, not production HSM.
- Mock/local/Sepolia blockchain modes.
- No browser-side blockchain account connection.
- No raw Employment ID on-chain.

### Phase 20: Final Security Review

Goal: audit the updated MVP before demo.

Audit for:

- Plaintext proposal leakage.
- Key release bypass.
- Frontend role trust.
- Raw Employment ID on-chain.
- Arbitrary relayer calls.
- Audit delete/update routes.
- Proposal access before close.
- Financial access before technical completion.
- Single-person award approval.
- Real secrets committed.
