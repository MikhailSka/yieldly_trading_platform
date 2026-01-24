### FR-BACKTEST-007: Check Backtest Quota
**Priority:** Medium
**User Story:** As a user, I want to check my backtest quota so that I know how many backtests I can run.

**Acceptance Criteria:**
- User can view current backtest quota from dashboard
- System displays:
  - Total quota for current month (role-based)
  - Backtests used this month
  - Backtests remaining
  - Quota reset date (first day of next month)
- Warning displayed when quota low (< 3 remaining)
- Error message when quota exhausted
- User directed to upgrade if quota exhausted
