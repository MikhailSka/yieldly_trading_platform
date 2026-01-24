### FR-BACKTEST-004: Generate Backtest Report
**Priority:** Medium
**User Story:** As a user, I want to generate a backtest report so that I can share or save my results.

**Acceptance Criteria:**
- User can generate report from backtest results page
- Report format: HTML (viewable in browser)
- Report includes:
  - Strategy name and version
  - Backtest parameters
  - All performance metrics
  - Equity curve chart (embedded image)
  - Drawdown chart (embedded image)
  - Complete trade log table
  - Summary statistics
- User can download report as standalone HTML file
- User can print report
- Report branded with Yieldly logo
- **Implementation Note:** Report generated from data in dedicated `backtesting_db` database (see ADR-002)
