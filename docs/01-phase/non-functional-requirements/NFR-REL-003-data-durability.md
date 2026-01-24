### NFR-REL-003: Data Durability
**Priority:** Critical
**Requirement:** No data loss in case of service failures.

**Specifications:**
- Database: Daily automated backups (30-day retention)
  - All service databases including `backtesting_db` for backtest results (see ADR-002)
- Point-in-time recovery available (7 days)
- Azure Blob Storage: Geo-redundant replication (GRS)
- Message queues: Persistent messages with acknowledgment
- Backups tested monthly for recoverability
