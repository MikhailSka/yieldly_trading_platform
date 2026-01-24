### FR-BACKTEST-001: Run Backtest
**Priority:** High
**User Story:** As a user, I want to run a backtest so that I can evaluate my strategy performance.

**Acceptance Criteria:**
- User can initiate backtest from strategy detail page
- User must configure backtest parameters:
  - Trading pair (e.g., BTCUSDT)
  - Start date
  - End date
  - Initial capital (USD)
  - Timeframe (5m, 15m, 1h, 4h, 1d)
  - Position size in amount or percentage
- System validates backtest parameters
- System checks user backtest quota (role-based)
- System decrements quota upon backtest start
- System queues backtest job to Backtesting Service
- System displays "Backtest Running" status
- System prevents simultaneous backtests (queue them)
- System automatically downloads required historical data if missing
- Backtest executes with realistic fee and slippage modeling
- System updates backtest status in real-time
- System sends notification when backtest completes
- **Backtest results stored in dedicated `backtesting_db` database** (separate from Portfolio Service - see ADR-002)
