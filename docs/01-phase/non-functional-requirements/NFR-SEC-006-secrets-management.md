### NFR-SEC-006: Secrets Management
**Priority:** Critical
**Requirement:** All secrets must be stored securely and never exposed in logs or code.

**Specifications:**
- Azure Key Vault for secret storage
- No secrets in environment variables (pull from Key Vault)
- No secrets in source code or configuration files
- Secrets rotated every 90 days (automated where possible)
- Audit logging for secret access
