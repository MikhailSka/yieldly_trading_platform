### FR-STRATEGY-003: Delete Strategy
**Priority:** Medium
**User Story:** As a user, I want to delete a strategy so that I can remove strategies I no longer need.

**Acceptance Criteria:**
- User can delete any owned strategy from strategy list
- System displays confirmation dialog before deletion
- System prevents deletion if strategy has running backtests
- System soft-deletes strategy (marks as deleted, preserves in database)
- Deleted strategies hidden from user interface
- Associated backtest results remain available
- Admin can restore deleted strategies if needed
