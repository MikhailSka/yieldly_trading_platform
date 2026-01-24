### FR-MARKET-005: View Historical OHLCV Data
**Priority:** High
**User Story:** As a user, I want to view historical price data so that I can analyze past market movements.

**Acceptance Criteria:**
- User can view historical OHLCV (Open, High, Low, Close, Volume) data
- User can select timeframe: 5m, 15m, 1h, 4h, 1d
- User can select date range (up to 2 years historical data)
- System displays data in chart format (candlestick, line, bar)
- User can zoom and pan chart
- Data loads from cache when available (fast)
- System displays loading indicator during data fetch
- Error message shown if data unavailable
