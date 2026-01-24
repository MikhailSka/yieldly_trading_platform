### FR-BACKTEST-003: View Backtest History
**Priority:** Medium
**User Story:** As a user, I want to view my backtest history so that I can compare different strategy versions.

**Acceptance Criteria:**
- User can view list of all past backtests
- Each backtest displays:
  - Strategy name and version
  - Trading pair
  - Date range tested
  - Initial capital
  - Total return
  - Maximum drawdown
  - Number of trades
  - Backtest run date
  - Status (Completed, Failed, Running)
- User can sort backtests by:
  - Run date (newest/oldest)
  - Total return (highest/lowest)
  - Maximum drawdown (best/worst)
  - Number of trades
- User can filter by:
  - Strategy name
  - Trading pair
  - Status (Completed, Failed, Running)
  - Date range
- User can click to view detailed results
- User can compare two backtests side-by-side
- List paginated (20 per page, max 100 per page)
- Pagination includes total count and page navigation
- **Implementation Note:** Backtest history queried from dedicated `backtesting_db` database (see ADR-002)
