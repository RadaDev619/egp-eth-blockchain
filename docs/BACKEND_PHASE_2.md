# Backend Phase 2

Implemented scope:

- Express app/server.
- Route registration.
- Request ID middleware.
- Centralized error handler.
- Environment config loader.
- Prisma PostgreSQL schema.
- Prisma seed file.
- Mock Bhutan NDI demo profiles.
- SHA-256 employee hash service using `employmentId + EMPLOYEE_HASH_SALT`.
- Backend-only employment-to-role mapping.
- JWT-backed application sessions.
- Auth middleware.
- RBAC service and `requirePermission` middleware.
- Procurement state-machine service.
- Append-only audit service.

Deferred:

- Procurement action controllers.
- File uploads/document hash verification.
- Blockchain relayer.
- Smart contract integration.
- Frontend integration.

Sensitive data rule:

Raw Employment ID is stored only in backend identity tables for the MVP. Audit records and future on-chain records use `employeeHash`.
