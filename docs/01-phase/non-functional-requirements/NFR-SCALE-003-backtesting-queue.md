### NFR-SCALE-003: Backtesting Queue
**Priority:** Medium
**Requirement:** System must handle 50 queued backtest jobs without failure.

**Measurement:**
- Test with 50 backtests submitted simultaneously
- All backtests must complete successfully
- Queue must not lose jobs

**Scaling Strategy:**
- Azure Service Bus queue with message persistence
- Horizontal scaling of Backtesting Service pods
- Auto-scaling based on queue depth
- **Database Write Scaling:** Multiple backtest workers writing to `backtesting_db` concurrently
  - PostgreSQL connection pooling to handle concurrent writes
  - Each backtest job writes independently (no write conflicts)
  - See ADR-002 for backtesting database architecture
