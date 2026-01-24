### FR-BACKTEST-005: View Trade Logs
**Priority:** Medium
**User Story:** As a user, I want to view detailed trade logs so that I can understand individual trade decisions.

**Acceptance Criteria:**
- User can view complete trade log for any backtest
- Each trade entry includes:
  - Trade number
  - Entry timestamp
  - Entry price
  - Entry reason (which rule triggered)
  - Exit timestamp
  - Exit price
  - Exit reason (which rule triggered: stop-loss, take-profit, signal)
  - Position size
  - Gross P&L
  - Fees paid
  - Net P&L
  - Return percentage
- Trade log downloadable as CSV
- Trade log filterable by profitable/losing trades
- User can click trade to see chart with entry/exit points highlighted
- **Implementation Note:** Individual trade records stored in `backtest_trades` table in `backtesting_db` database (see ADR-002)
