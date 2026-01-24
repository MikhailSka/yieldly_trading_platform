### NFR-PERF-003: Backtest Execution Performance
**Priority:** Medium
**Requirement:** Backtests must complete within reasonable timeframes based on data volume and complexity.

**Measurement Scenarios:**
The following scenarios serve as baseline performance targets and will be measured during development to establish realistic expectations:

**Scenario 1: Short-term Daily Data**
- Data: 1 year, daily candles, single trading pair
- Strategy: Simple (2-3 indicators)
- Target: Establish baseline (measure during development)
- Acceptable: User perception of "reasonably fast"

**Scenario 2: Medium-term Hourly Data**
- Data: 1 year, 1-hour candles, single trading pair
- Strategy: Moderate complexity (4-5 indicators)
- Target: Establish baseline (measure during development)
- Acceptable: User perception of "worth the wait"

**Scenario 3: Long-term 5-Minute Data**
- Data: 6 months, 5-minute candles, single trading pair
- Strategy: Moderate complexity
- Target: Establish baseline (measure during development)
- Acceptable: < 10 minutes

**Monitoring Approach:**
- Track actual execution times per scenario during development
- Document baseline performance for each scenario
- Monitor 95th percentile execution times
- Alert if execution time exceeds 3× baseline for similar scenarios
- Track execution time trends over time

**Performance Factors to Document:**
- Strategy complexity (number of indicators, conditions)
- Data volume (timeframe × date range)
- Resource availability (CPU, memory)
- Database query performance
  - Read from `historical_data_db` (TimescaleDB) for market data
  - Write to `backtesting_db` (PostgreSQL) for results storage (see ADR-002)

**Notes:**
- Performance highly dependent on strategy complexity
- Python backtesting service slower than compiled languages (acceptable trade-off)
- Exact performance metrics will be established during initial development
- Focus on user experience ("feels fast enough") rather than absolute metrics
