### NFR-MAINT-003: Logging
**Priority:** High
**Requirement:** All services must implement structured logging for troubleshooting.

**Specifications:**
- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Request ID propagation across services
- Sensitive data never logged (passwords, API keys)
- Centralized logging to Azure Monitor
- Logs retained for 30 days
