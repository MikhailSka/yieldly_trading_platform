### FR-PORTFOLIO-003: View Transaction History
**Priority:** Medium
**User Story:** As a user, I want to view my transaction history so that I can track all portfolio changes.

**Acceptance Criteria:**
- User can view complete transaction history from connected exchanges
- Each transaction displays:
  - Timestamp
  - Type (Deposit, Withdrawal, Trade, Fee)
  - Asset
  - Quantity
  - Price (for trades)
  - Exchange
- User can filter by:
  - Date range
  - Transaction type
  - Exchange
  - Asset
- User can export transaction history to CSV
- Transactions paginated (50 per page)
- System syncs new transactions every 15 minutes
