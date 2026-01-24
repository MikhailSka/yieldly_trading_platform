# NFR-PORTFOLIO-002: Portfolio Snapshot Storage and Performance

**Priority:** High
**Type:** Non-Functional Requirement

**Description:**
The Portfolio Service must store hourly portfolio snapshots to enable historical tracking and fast chart generation without overloading broker APIs or databases.

**Requirements:**

**Storage:**
- Hourly snapshots during 24/7 market hours
- Each snapshot max 50 KB (JSON format)
- Store in PostgreSQL (portfolio_db)
- Partition by month for query performance
- Retention policy:
  - Hourly snapshots: 30 days
  - Daily snapshots: 1 year
  - Weekly snapshots: All time

**Performance:**
- Snapshot creation: < 5 seconds per user
- Historical query (30 days): < 200ms
- Chart generation using snapshots: < 200ms (vs 2-5s querying brokers directly)
- Database storage growth: ~1.2 MB per user per year

**Reliability:**
- Snapshot job runs every hour (cron)
- Failed snapshots logged but don't block subsequent runs
- Automatic retry for transient failures (3 attempts)
- Alert if snapshot failure rate > 5%

**Scalability:**
- Supports 1000 concurrent users with hourly snapshots
- Batch snapshot creation to reduce database load
- Indexed queries on user_id and timestamp

**Related:**
- FR-PORTFOLIO-008 (View historical snapshots)
- ADR-022 (Portfolio service architecture)
