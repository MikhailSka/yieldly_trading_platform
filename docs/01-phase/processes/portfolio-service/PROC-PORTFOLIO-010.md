### PROC-PORTFOLIO-010: Sync Transactions from Exchange

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-003
**Related NFR:** NFR-PERF-001, NFR-INT-001
**Related ADR:** ADR-032

#### Trigger
- **Session-based:** Background job runs every 5 minutes for users with active sessions
- **Manual:** User triggers manual sync
- **Connection:** After new broker connection added

**Note:** Transaction sync only runs when the user has an active session. There's no need to sync transactions when the user isn't viewing the application.

#### Actor
System (Session-based Scheduler) OR Authenticated User (manual trigger)

#### Preconditions
- User has active broker connections
- Broker connections have valid credentials
- **For session-based sync:** User has an active session (last activity < 15 minutes)
- For manual sync: User hasn't exceeded sync rate limit

#### Inputs

**API Endpoint (Manual Trigger):** `POST /api/v1/portfolio/transactions/sync`

**Request Body (optional):**
```json
{
  "exchange": "bybit",
  "startDate": "2024-01-01T00:00:00Z"
}
```

**Parameter Details:**
- `exchange` (string, optional): Sync specific exchange only
- `startDate` (ISO8601, optional): Sync transactions from this date (default: last sync date)

#### Process Steps

**For Session-Based Scheduled Job:**

1. **Scheduled Job triggers every 5 minutes**
2. **Sync Scheduler queries users with active sessions**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT DISTINCT us.user_id
   FROM user_sessions us
   WHERE us.is_active = true
     AND us.last_activity_at > NOW() - INTERVAL '15 minutes';
   ```
3. **Filter users who haven't synced recently**
   ```sql
   -- Only sync users who haven't synced in the last 5 minutes
   SELECT us.user_id
   FROM user_sessions us
   LEFT JOIN portfolio_sync_logs psl ON us.user_id = psl.user_id
     AND psl.sync_type = 'transaction_sync'
     AND psl.sync_started_at > NOW() - INTERVAL '5 minutes'
   WHERE us.is_active = true
     AND us.last_activity_at > NOW() - INTERVAL '15 minutes'
     AND psl.id IS NULL;
   ```
4. **For each eligible user, verify they have active connections**
   ```sql
   -- Query broker_db
   SELECT DISTINCT user_id
   FROM broker_connections
   WHERE user_id = $1
     AND status = 'active'
     AND deleted_at IS NULL;
   ```
5. **For each user with connections, proceed with steps 7-17**

**For Manual Trigger:**

1. **API Gateway receives request** → `/api/v1/portfolio/transactions/sync` (POST)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller checks sync rate limit**
   ```
   INCR portfolio:sync:{userId}:hour
   EXPIRE portfolio:sync:{userId}:hour 3600
   GET portfolio:sync:{userId}:hour
   ```
   - If count > 4 → Return 429 "Sync rate limit exceeded"
4. **Proceed with steps 7-17 for the requesting user**

**For New Connection Trigger:**

1. **Broker Service emits event after successful connection**
2. **Portfolio Service receives `broker.connection.created` event**
3. **Proceed with steps 7-17 for the user's new connection only**

**Common Steps:**

7. **Portfolio Controller queries user's broker connections**
   ```sql
   -- Query broker_db via Broker Service
   SELECT connection_id, exchange, key_vault_secret_name
   FROM broker_connections
   WHERE user_id = $1
     AND status = 'active'
     AND deleted_at IS NULL
     AND ($2::varchar IS NULL OR exchange = $2);
   ```
8. **For each connection, determine sync start date**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT MAX(transaction_timestamp) as last_sync
   FROM transactions
   WHERE user_id = $1
     AND exchange = $2;
   ```
   - If no previous transactions → Use account creation date or 90 days ago
   - If startDate provided → Use max(startDate, lastSync - 1 day) for overlap
9. **Begin sync job tracking**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   INSERT INTO portfolio_sync_logs (
     user_id, sync_type, sync_started_at, success
   ) VALUES ($1, 'transaction_sync', NOW(), false)
   RETURNING id;
   ```
10. **Broker Service fetches transaction history from exchange**

    **For Bybit:**
    ```
    GET /v5/account/transaction-log
    GET /v5/order/history
    ```

    **For Binance:**
    ```
    GET /api/v3/myTrades
    GET /sapi/v1/capital/deposit/hisrec
    GET /sapi/v1/capital/withdraw/history
    ```

11. **Exchange Adapter normalizes transactions**
    ```go
    type NormalizedTransaction struct {
      ExchangeTransactionID string
      TransactionType       TransactionType // trade, deposit, withdrawal, fee
      Asset                 string
      Amount                decimal.Decimal
      PriceUSD              decimal.Decimal
      ValueUSD              decimal.Decimal
      FeeAmount             decimal.Decimal
      FeeAsset              string
      FeeUSD                decimal.Decimal
      TradePair             string // only for trades
      Side                  string // buy/sell, only for trades
      Timestamp             time.Time
    }
    ```
12. **Portfolio Repository upserts transactions (avoid duplicates)**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    INSERT INTO transactions (
      user_id, exchange, exchange_transaction_id,
      transaction_type, asset, amount, price_usd, value_usd,
      fee_amount, fee_asset, fee_usd,
      trade_pair, side, transaction_timestamp, synced_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (user_id, exchange, exchange_transaction_id)
    DO UPDATE SET
      price_usd = EXCLUDED.price_usd,
      value_usd = EXCLUDED.value_usd,
      fee_usd = EXCLUDED.fee_usd,
      synced_at = NOW()
    WHERE transactions.synced_at < NOW() - INTERVAL '1 hour';
    ```
13. **Count imported transactions**
    ```go
    importStats := ImportStats{
      NewTransactions:     countNew,
      UpdatedTransactions: countUpdated,
      SkippedDuplicates:   countSkipped,
    }
    ```
14. **Trigger cost basis recalculation**
    - Call PROC-PORTFOLIO-011 for affected assets
15. **Update sync log with results**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    UPDATE portfolio_sync_logs
    SET sync_completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM NOW() - sync_started_at),
        success = true,
        exchanges_synced = $2,
        transactions_imported = $3
    WHERE id = $1;
    ```
16. **Update user session last sync timestamp**
    ```sql
    -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
    UPDATE user_sessions
    SET last_transaction_sync_at = NOW()
    WHERE user_id = $1 AND is_active = true;
    ```
17. **Invalidate relevant caches**
    ```
    DEL portfolio:{userId}:transactions:*
    DEL portfolio:{userId}:pnl:*
    ```
18. **Return sync results** (for manual trigger)

#### Outputs

**Success Response - Manual Trigger (200 OK):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "completed",
    "exchanges": [
      {
        "exchange": "bybit",
        "status": "synced",
        "transactions": {
          "new": 45,
          "updated": 3,
          "skipped": 152
        },
        "dateRange": {
          "from": "2024-12-10T00:00:00Z",
          "to": "2024-12-16T12:00:00Z"
        }
      },
      {
        "exchange": "binance",
        "status": "synced",
        "transactions": {
          "new": 12,
          "updated": 0,
          "skipped": 88
        },
        "dateRange": {
          "from": "2024-12-10T00:00:00Z",
          "to": "2024-12-16T12:00:00Z"
        }
      }
    ],
    "summary": {
      "totalNewTransactions": 57,
      "totalUpdatedTransactions": 3,
      "totalSkippedDuplicates": 240,
      "durationMs": 3452
    },
    "costBasisUpdated": true,
    "syncedAt": "2024-12-16T12:00:03Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:03Z",
    "version": "v1"
  }
}
```

**Success Response - Partial Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "partial",
    "exchanges": [
      {
        "exchange": "bybit",
        "status": "synced",
        "transactions": {
          "new": 45,
          "updated": 3,
          "skipped": 152
        }
      },
      {
        "exchange": "binance",
        "status": "failed",
        "error": {
          "code": "EXCHANGE_API_ERROR",
          "message": "Rate limit exceeded on Binance API"
        }
      }
    ],
    "warnings": [
      {
        "exchange": "binance",
        "message": "Binance sync failed. Will retry in next scheduled sync.",
        "code": "PARTIAL_SYNC"
      }
    ],
    "syncedAt": "2024-12-16T12:00:03Z"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:03Z",
    "version": "v1",
    "partialSync": true
  }
}
```

**Async Response - Long Sync (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "in_progress",
    "message": "Sync started. This may take a few minutes for large transaction histories.",
    "pollUrl": "/api/v1/portfolio/transactions/sync/uuid/status",
    "estimatedCompletion": "< 5 minutes"
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Sync rate limit exceeded",
    "details": {
      "limit": 4,
      "window": "1 hour",
      "retryAfter": 1800,
      "note": "Automatic sync runs every 5 minutes while you're active"
    }
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Transactions fetched from all active exchanges
- Transactions deduplicated and stored
- Cost basis recalculated for affected assets
- Sync logged for audit
- User session sync timestamp updated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Return "Sync rate limit exceeded" |
| No active connections | 200 | Return empty sync result with message |
| Exchange API error | 200 | Mark exchange as failed, continue with others |
| All exchanges failed | 503 | Return "Unable to sync transactions" |
| Invalid date range | 400 | Return "Invalid date range" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-INT-001**: Exchange API Integration

**Process-Specific Notes:**
- Session-based: Every 5 minutes while user has active session
- Session timeout: 15 minutes of inactivity
- Manual rate limit: 4 per hour
- Target sync time: < 30 seconds for typical user
- Long syncs (>1 minute): Return 202 Accepted with poll URL

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`, `portfolio_sync_logs`, `user_sessions`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

**Cache:**
- Redis - Rate limiting, cache invalidation

**External Services:**
- Broker Connectivity Service: Transaction history endpoints

#### Notes

**Session-Based Sync Rationale:**
- Previous approach: Sync every 6 hours for all users
- New approach: Sync every 5 minutes only for active users
- Benefits:
  - Reduces unnecessary API calls to exchanges
  - Provides near real-time data when user is viewing
  - Respects exchange rate limits better
  - Users don't need transaction notifications from our system (exchanges send their own)

**Session Activity Tracking:**
User session activity is tracked via:
- API requests (any authenticated endpoint)
- WebSocket heartbeats
- Frontend periodic pings

Session becomes inactive after 15 minutes of no activity.

**Incremental Sync:**
- Only fetches transactions since last sync
- 1-day overlap to catch late-appearing transactions
- Exchange transaction IDs used for deduplication

**Transaction Types Synced:**
- Trades (buy/sell)
- Deposits
- Withdrawals
- Trading fees
- Funding fees (where available)

**Exchange API Mapping:**

| Exchange | Trades | Deposits | Withdrawals |
|----------|--------|----------|-------------|
| Bybit | `/v5/order/history` | `/v5/account/transaction-log` | `/v5/account/transaction-log` |
| Binance | `/api/v3/myTrades` | `/sapi/v1/capital/deposit/hisrec` | `/sapi/v1/capital/withdraw/history` |

**Cost Basis Impact:**
- New trades trigger cost basis recalculation
- Deposits don't affect cost basis (they establish it)
- Withdrawals may affect cost basis depending on method

**Rate Limiting:**
- Manual: 4 syncs per hour per user
- Session-based: Every 5 minutes while active
- Exchange API limits respected (handled by Broker Service)

**Related Processes:**
- PROC-PORTFOLIO-005: Get Transactions History (reads synced data)
- PROC-PORTFOLIO-011: Calculate/Update Cost Basis (triggered by sync)
- PROC-BROKER-004: Fetch Portfolio Data (fetches balances, not transactions)
- PROC-PORTFOLIO-018: Manage User Session (tracks session activity)

---
