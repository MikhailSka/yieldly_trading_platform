### NFR-OPS-001: Backup & Recovery
**Priority:** Critical
**Requirement:** All critical data must be backed up with tested recovery procedures.

**Specifications:**
- Database backups: Daily automated (30-day retention)
  - All service databases: `user_db`, `strategy_db`, `portfolio_db`, `broker_db`, `notification_db`
  - Historical data: `historical_data_db` (TimescaleDB)
  - Backtesting results: `backtesting_db` (see ADR-002 for database architecture)
- Backup testing: Monthly recovery drill
- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 24 hours
- Backup storage: Geo-redundant
