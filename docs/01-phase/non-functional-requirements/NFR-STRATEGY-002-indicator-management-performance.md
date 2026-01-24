# NFR-STRATEGY-002: Indicator Management Performance

**Priority:** Medium
**Type:** Non-Functional Requirement

**Description:**
The Strategy Service must efficiently manage and serve technical indicator definitions to frontend with minimal latency.

**Requirements:**

**Caching:**
- Most common 20 indicators cached in Redis
- Cache TTL: 24 hours
- Cache invalidation on admin update
- Cache hit rate target: > 90%

**Synchronization:**
- Initial sync from Backtesting Service on deployment
- Periodic sync: Weekly (automated)
- Manual sync: Admin-triggered
- Sync preserves admin customizations (descriptions, active status)

**Performance:**
- Indicator list query: < 50ms (cached)
- Indicator detail query: < 100ms
- Sync operation: < 10 seconds for all indicators
- Database storage: ~1 MB for all indicator configs

**Availability:**
- Indicator list available even if Backtesting Service down (stale cache acceptable)
- Fallback to database if Redis unavailable
- Graceful degradation if sync fails

**Related:**
- FR-STRATEGY-010 (Browse indicators)
- ADR-030 (Indicator management architecture)
