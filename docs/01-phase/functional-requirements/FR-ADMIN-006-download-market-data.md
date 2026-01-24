### FR-ADMIN-006: Download Market Data
**Priority:** High
**User Story:** As an admin, I want to download historical market data so that it's available for backtesting.

**Acceptance Criteria:**
- Admin can download historical data from admin panel
- Admin must specify:
  - Exchange (Bybit, Binance)
  - Trading pair
  - Timeframe (5m, 15m, 1h, 4h, 1d)
  - Start date
  - End date
- System validates data not already present in database
- System initiates download job (asynchronous)
- System displays download progress
- System stores data in TimescaleDB
- System validates data quality after download
- Admin receives notification when download completes
- Admin can view download job history
