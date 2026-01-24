### NFR-REL-002: Service Resilience
**Priority:** High
**Requirement:** Services must implement resilience patterns to handle failures gracefully.

**Specifications:**
- Circuit breakers for external API calls
- Retry logic with exponential backoff
- Timeout limits on all external calls
- Health checks for all services
- Kubernetes auto-healing (restart unhealthy pods)
