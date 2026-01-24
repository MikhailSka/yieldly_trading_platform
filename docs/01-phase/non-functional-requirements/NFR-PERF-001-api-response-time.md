### NFR-PERF-001: API Response Time
**Priority:** High
**Requirement:** 95% of API requests must complete within 500ms under normal load.

**Measurement:**
- Target: P95 latency < 500ms
- Monitoring: Azure Monitor Application Insights
- Tracked endpoints: All REST APIs

**Exceptions:**
- Backtest initiation: < 2 seconds
- Large data exports: < 5 seconds
- Historical data queries (2+ years): < 3 seconds
