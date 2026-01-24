### NFR-MAINT-004: Monitoring & Alerting
**Priority:** High
**Requirement:** All critical metrics must be monitored with automated alerting.

**Specifications:**
- Application metrics: Response time, error rate, throughput
- Infrastructure metrics: CPU, memory, disk, network
- Business metrics: Backtests run, new users, active users
- Alerts for:
  - Service downtime
  - Error rate > 5%
  - Response time P95 > 1s
  - Database connection pool exhaustion
  - Disk space < 20%
