# FR-PORTFOLIO-008: View Historical Portfolio Snapshots

**Priority:** Medium
**User Story:** As a trader, I want to view my historical portfolio data so that I can track my performance over time.

**Acceptance Criteria:**
- User can view portfolio value history for different time periods:
  - Last 24 hours (hourly snapshots)
  - Last 7 days (hourly snapshots)
  - Last 30 days (hourly snapshots)
  - Last 1 year (daily snapshots)
  - All time (weekly snapshots for data > 1 year old)
- Each snapshot displays:
  - Timestamp
  - Total portfolio value (USD)
  - Realized P&L
  - Unrealized P&L
  - Number of assets
  - Exchange breakdown
- User can compare portfolio value at different points in time
- User can see percentage change between snapshots
- User can export historical data to CSV
- Historical data displayed in table and chart formats

**API Endpoints:**
- `GET /api/v1/portfolio/history?from=<timestamp>&to=<timestamp>&interval=1h`

**Response Format:**
```json
{
  "snapshots": [
    {
      "timestamp": "2025-11-03T14:00:00Z",
      "total_value_usd": 10523.45,
      "realized_pnl": 523.45,
      "unrealized_pnl": 1250.00,
      "asset_count": 3,
      "exchange_count": 2
    }
  ],
  "summary": {
    "total_change_usd": 1523.45,
    "total_change_percent": 16.9,
    "peak_value_usd": 11200.00,
    "max_drawdown_percent": -5.2
  }
}
```

**Related Features:**
- FR-PORTFOLIO-007 (View performance charts)
- FR-PORTFOLIO-004 (View performance metrics)
