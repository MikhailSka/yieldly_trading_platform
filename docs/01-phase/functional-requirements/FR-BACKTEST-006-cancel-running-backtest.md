### FR-BACKTEST-006: Cancel Running Backtest
**Priority:** Low
**User Story:** As a user, I want to cancel a running backtest so that I can stop a long-running test.

**Acceptance Criteria:**
- User can cancel running backtest from backtest status page
- System stops backtest execution immediately
- System marks backtest as "Cancelled" status
- Partial results not saved
- Backtest quota not refunded for cancelled backtests
- System sends notification about cancellation
