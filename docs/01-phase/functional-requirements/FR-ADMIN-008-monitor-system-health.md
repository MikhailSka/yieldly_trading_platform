### FR-ADMIN-008: Monitor System Health
**Priority:** High
**User Story:** As an admin, I want to monitor system health so that I can ensure platform stability.

**Acceptance Criteria:**
- Admin can view system health dashboard showing:
  - Service status (all microservices)
  - Database connectivity (PostgreSQL, TimescaleDB, Redis)
  - Azure Service Bus health
  - Azure Blob Storage health
  - Exchange API connectivity (Bybit, Binance)
  - API Gateway status
- Each service displays:
  - Status (Healthy, Degraded, Down)
  - Response time
  - Error rate
  - Last health check timestamp
- Dashboard auto-refreshes every 30 seconds
- Admin can manually trigger health checks
- Historical health data viewable (uptime trends)
