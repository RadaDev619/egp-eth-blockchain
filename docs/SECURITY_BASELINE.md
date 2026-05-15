# Security Baseline

Phase 2 establishes backend identity, RBAC, state-machine, and audit boundaries.

Required constraints for later phases:

- No frontend blockchain signing, browser-side account connection, arbitrary relayer calls, or asset issuance scope.
- No raw Employment ID on-chain.
- No frontend-trusted role selection.
- No generic relayer contract-call endpoint.
- No editable audit history.
- No real secrets committed to the repository.

Current backend controls:

- Role comes from backend Employment ID, employer, position, and employment type mapping.
- Sessions include backend-derived role and salted `employeeHash`.
- Permission checks happen in backend middleware.
- Unauthorized permission attempts are written to `AuditLog`.
- Procurement transition rules are represented in `procurementStateMachine`.
- Audit logs are append-only through service methods; no delete/update audit API exists.
