### NFR-SCALE-002: Data Volume Growth
**Priority:** High
**Requirement:** System must handle 100GB of historical market data in Phase 1.

**Projections:**
Based on actual data collection experience:
- ~200-300 trading symbols (across Binance and Bybit)
- 2 years of historical data per symbol
- Timeframes: 5-minute and 15-minute candles (primary), 1-hour and daily (secondary)
- Estimated total: ~100GB with TimescaleDB compression
- Note: Previous data collection from Binance alone (~500 coins, multiple years) resulted in approximately 100GB

**Scaling Strategy:**
- TimescaleDB automatic partitioning and compression (can reduce size by 10-20×)
- Retention policies:
  - 5-minute data: 1 year (then compress or archive)
  - 15-minute data: 2 years (then compress)
  - 1-hour data: 5 years
  - Daily data: 10 years
- Compression after 6 months (TimescaleDB native compression)
- Archive oldest data to Azure Blob Storage (cold storage) if needed
- Incremental data loading (download only missing data)

**Phase 1 Scope:**
- Start with 20-50 most popular trading pairs
- 2 years of data per pair
- Expand to 200-300 symbols over time
- Monitor storage growth and adjust retention policies

**Additional Data Volume Considerations:**
- **Backtesting Results Database (`backtesting_db`):**
  - Each backtest generates thousands of simulated trade records
  - Equity curve data points (time-series for portfolio value)
  - Estimated: 10-50MB per backtest (varies with strategy complexity and duration)
  - Retention: Keep all backtest results (valuable for strategy comparison)
  - Archive policy: Move backtests older than 1 year to cold storage if needed
  - See ADR-002 for backtesting database architecture
