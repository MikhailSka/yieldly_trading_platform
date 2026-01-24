### NFR-SEC-004: Strategy Code Execution Security
**Priority:** Critical
**Requirement:** User-provided strategy code must execute in secure sandbox preventing malicious actions.

**Specifications:**
- Docker container isolation (--network none)
- RestrictedPython for code sandboxing
- Filesystem: Read-only except /tmp
- Memory limit: 512MB
- CPU limit: 0.5 core
- Timeout: 5 minutes maximum
- Blocked libraries: requests, urllib, subprocess, os, sys
- AST parsing to detect prohibited patterns
