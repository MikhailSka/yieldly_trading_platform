### PROC-HISTORICAL-005: Delete Historical Data (Admin)

**Service Owner:** Historical Data Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-025, ADR-032

#### Trigger
Admin wants to remove historical data for a specific symbol/timeframe to free storage, remove corrupted data, or clean up test data

#### Actor
Admin User

#### Preconditions
- User is authenticated with admin role
- Valid JWT access token with admin permissions
- Symbol exists and has data to delete

#### Overview

This process supports two deletion modes:
1. **Delete by Symbol** - Remove all data for a symbol
2. **Delete by Date Range** - Remove data within a specific date range

**Important:** This is a destructive operation. Data cannot be recovered after deletion (must be re-downloaded from exchange).

**Storage Architecture:** Historical data is stored in 1-minute (1m) timeframe only. Higher timeframes are computed on-the-fly during retrieval (see PROC-HISTORICAL-002). Therefore, there is no "delete by timeframe" option - deleting data always removes the underlying 1m candles.

---

## 1. Delete All Data for Symbol (All 1m Candles)

#### Inputs
**API Endpoint:** `DELETE /api/v1/admin/historical/symbols/{exchange}/{symbol}`

**Path Parameters:**
- `{exchange}`: Exchange identifier (`bybit`, `binance`)
- `{symbol}`: Trading pair symbol (e.g., `BTCUSDT`)

**Query Parameters:**
```
DELETE /api/v1/admin/historical/symbols/{exchange}/{symbol}?
  confirm=true
```

**Parameter Details:**
- `confirm` (boolean, required): Must be `true` to confirm deletion

#### Process Steps

1. **API Gateway receives request** → Routes to Historical Data Service
2. **API Gateway validates JWT** → Extracts user_id and role
3. **Authorization check** → Verify user has admin role
   - If not admin → Return 403 "Admin access required"
4. **Validate confirmation parameter**
   - If `confirm` != true → Return 400 "Confirmation required"
5. **Historical Data Controller verifies symbol exists**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   SELECT id, exchange, symbol, total_candles_count
   FROM symbols_metadata
   WHERE exchange = $1 AND symbol = $2;
   ```
   - If not found → Return 404 "Symbol not found"
6. **Begin transaction**
7. **Delete all OHLCV data for symbol (all 1m candles)**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: All data is stored at 1m timeframe only
   DELETE FROM ohlcv_data
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m'
   RETURNING COUNT(*) as deleted_count;
   ```
8. **Delete all data ranges for symbol**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   -- Note: Only 1m timeframe exists in data ranges
   DELETE FROM symbol_data_ranges
   WHERE exchange = $1 AND symbol = $2 AND timeframe = '1m';
   ```
9. **Delete quality check records for symbol**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
   DELETE FROM data_quality_checks
   WHERE exchange = $1 AND symbol = $2;
   ```
10. **Update symbol metadata**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml
    UPDATE symbols_metadata
    SET total_candles_count = 0,
        earliest_data_timestamp = NULL,
        latest_data_timestamp = NULL,
        available_timeframes = NULL,
        data_completeness_percentage = NULL,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE exchange = $1 AND symbol = $2;
    ```
11. **Commit transaction**
12. **Invalidate cache entries for symbol**
    ```
    DEL historical:{exchange}:{symbol}:*
    ```
13. **Log admin action** (audit trail)
14. **Return deletion summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "deletionSummary": {
      "candlesDeleted": 2628000,
      "dataRangesDeleted": 1,
      "qualityChecksDeleted": 15,
      "note": "All 1m candles deleted. Higher timeframes were computed on-the-fly and are no longer available."
    },
    "message": "All historical data (1m candles) for bybit:BTCUSDT has been deleted. Symbol metadata retained.",
    "deletedAt": "2024-12-16T12:00:00Z",
    "deletedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 2. Delete Data by Date Range

#### Inputs
**API Endpoint:** `DELETE /api/v1/admin/historical/data`

**Request Body:**
```json
{
  "exchange": "bybit",
  "symbol": "BTCUSDT",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-06-30T23:59:59Z",
  "confirm": true
}
```

**Note:** No timeframe parameter - data is always stored at 1m granularity. Deleting a date range removes all 1m candles in that range.

#### Process Steps

1-4. Same authentication and authorization
5. **Validate date range**
   - `endDate` >= `startDate`
   - Range must be reasonable (not entire dataset unless intended)
6. **Begin transaction**
7. **Delete OHLCV data within date range (1m candles)**
   ```sql
   -- Note: All data is stored at 1m timeframe only
   DELETE FROM ohlcv_data
   WHERE exchange = $1
     AND symbol = $2
     AND timeframe = '1m'
     AND timestamp >= $3
     AND timestamp <= $4
   RETURNING COUNT(*) as deleted_count;
   ```
8. **Recalculate and update data ranges**
   - This is complex: may split existing ranges or shrink them
   - Only affects '1m' timeframe ranges (the only stored timeframe)
9. **Update symbol metadata**
10. **Commit transaction**
11. **Invalidate cache**
12. **Log admin action**
13. **Return deletion summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exchange": "bybit",
    "symbol": "BTCUSDT",
    "storageTimeframe": "1m",
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-06-30T23:59:59Z"
    },
    "deletionSummary": {
      "candlesDeleted": 262080,
      "note": "Deleted 1m candles. Higher timeframes were computed on-the-fly and are affected proportionally."
    },
    "message": "Historical data (1m candles) for the specified range has been deleted.",
    "deletedAt": "2024-12-16T12:00:00Z",
    "deletedBy": "admin-user-id"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Error Responses

**Error Response (400 Bad Request - No Confirmation):**
```json
{
  "success": false,
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "Deletion confirmation required",
    "details": {
      "hint": "Add confirm=true query parameter to confirm deletion"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Symbol not found",
    "details": {
      "exchange": "bybit",
      "symbol": "INVALIDPAIR"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (403 Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Admin access required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Data deleted from OHLCV table
- Data ranges updated or deleted
- Quality checks cleaned up
- Symbol metadata updated
- Cache invalidated
- Admin action logged for audit
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin access required" |
| No confirmation | 400 | Return "Deletion confirmation required" |
| Symbol not found | 404 | Return "Symbol not found" |
| Invalid date range | 400 | Return "Invalid date range" |
| Database error | 500 | Rollback transaction, log error |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Large Deletions**: Deleting millions of candles may take several seconds
- **Transaction Size**: For very large deletes, consider batched deletion
- **TimescaleDB**: Use chunk-based operations when possible for efficiency
- **Expected Execution Time**: < 5 seconds for typical operations

#### Dependencies

**Database:**
- `historical_db` (TimescaleDB) - Tables: `ohlcv_data`, `symbol_data_ranges`, `symbols_metadata`, `data_quality_checks`
- Verify schema: docs/01-phase/database-schemas/historical_data_db_schema.dbml

**Cache:**
- Redis - Invalidate cached queries

#### Notes

**Data Recovery:**
- Deleted data CANNOT be recovered from database
- Data must be re-downloaded from exchange if needed
- Consider backing up before large deletions

**Audit Trail:**
- All deletions should be logged with:
  - Admin user ID
  - Deletion parameters
  - Number of records deleted
  - Timestamp

**1-Minute Storage Architecture:**
- All data is stored at 1-minute (1m) granularity only
- Higher timeframes (5m, 15m, 1h, 4h, 1d) are computed on-the-fly during retrieval
- Deleting 1m candles affects all timeframes (since they are computed from 1m)
- There is no "delete by timeframe" option because only 1m is stored

**Use Cases:**
1. Remove corrupted/invalid data
2. Clean up test data from development
3. Free storage space for rarely used symbols
4. Remove data before delisting symbol

**TimescaleDB Considerations:**
- Deleting data in compressed chunks may be slower
- Consider decompressing chunks before deletion if performance is critical
- Large range deletions may benefit from `drop_chunks()` if deleting entire time periods

**Related Processes:**
- PROC-HISTORICAL-001: Ingest Historical Data (to re-download)
- PROC-HISTORICAL-003: List Downloaded Symbols (Admin)
- PROC-HISTORICAL-004: Get Symbol Data Details (Admin)
- PROC-HISTORICAL-006: Run Data Correctness Check (Admin)

---
