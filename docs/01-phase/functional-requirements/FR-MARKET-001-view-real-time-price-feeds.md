### FR-MARKET-001: View Real-Time Price Feeds
**Priority:** High
**User Story:** As a user, I want to view real-time price data so that I can monitor current market conditions.

**Acceptance Criteria:**
- User can view live price updates via WebSocket connection
- Price updates occur in real-time (within 1 second of exchange update)
- User can view ticker data including:
  - Last price
  - 24h high/low
  - 24h volume
  - 24h price change percentage
- User can select trading pair from available symbols
- Prices update automatically without page refresh
- System handles reconnection automatically if WebSocket disconnects
