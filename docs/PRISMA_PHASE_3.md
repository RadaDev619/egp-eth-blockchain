# Prisma Phase 3

Implemented schema models:

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

Seed data:

- `PROC-001` as `PROCUREMENT_OFFICER`
- `VEND-001` as `VENDOR`
- `EVAL-001` as `EVALUATOR`
- `FIN-001` as `FINANCE_OFFICER`
- `AUD-001` as `AUDITOR`
- Role permissions from `backend/src/types/domain.ts`
- Optional demo tender `TDR-DEMO-001`
- Tender version v1, transition, audit log, and mock blockchain transaction for the demo tender

Audit append-only design:

- `AuditLog` has `createdAt` but no `updatedAt` or `deletedAt`.
- Seed creates audit rows only when matching seed audit evidence is absent.
- Application code should continue to route audit writes through `auditService.appendAuditEvent`.
