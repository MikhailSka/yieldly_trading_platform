### NFR-SEC-002: Data Encryption
**Priority:** Critical
**Requirement:** All sensitive data must be encrypted at rest and in transit.

**Specifications:**
- **In Transit:**
  - TLS 1.3 for all HTTP connections
  - WSS (WebSocket Secure) for real-time connections
  - No insecure HTTP allowed in production
- **At Rest:**
  - Exchange API keys encrypted using Azure Key Vault
  - Database encryption enabled (PostgreSQL TDE)
  - Backup encryption enabled
  - Azure Blob Storage encryption enabled (default)
