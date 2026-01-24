### FR-BACKTEST-002: View Backtest Results
**Priority:** High
**User Story:** As a user, I want to view backtest results so that I can evaluate strategy performance.

**Acceptance Criteria:**
- User can view detailed backtest results including:
  - **Performance Metrics:**
    - Total return (absolute and percentage)
    - Annualized return
    - Sharpe ratio
    - Maximum drawdown
    - Maximum drawdown duration
  - **Trade Statistics:**
    - Total number of trades
    - Winning trades
    - Losing trades
    - Win rate percentage
    - Average win
    - Average loss
    - Profit factor (gross profit / gross loss)
    - Largest winning trade
    - Largest losing trade
  - **Equity Curve:**
    - Portfolio value over time (chart)
    - Drawdown chart
    - Buy/sell signals on price chart
  - **Trade Log:**
    - Complete list of all trades with entry/exit prices, P&L
- Results displayed in interactive dashboard
- Charts zoomable and interactive
- User can export results to PDF or HTML
- **Implementation Note:** All backtest data (metrics, equity curves, trade logs) retrieved from dedicated `backtesting_db` database (see ADR-002)
