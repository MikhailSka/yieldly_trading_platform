# ADR-031: Automatic API Capability Detection for Exchange Connections

**Status:** Accepted  
**Date:** 2025-01-22

## Context

When users connect their exchange accounts (Bybit, Binance) to Yieldly, they configure API key permissions directly on the exchange platform. These permissions determine what operations the API key can perform (read portfolio, access market data, execute trades, withdraw funds, etc.).

Initially, the design included manual feature toggles in Yieldly (checkboxes for "Enable Portfolio Sync", "Enable Market Data", "Enable Historical Data"). This approach created several problems:

1. **Duplicate Configuration**: Users would need to configure permissions twice - once on the exchange, once in Yieldly
2. **Configuration Drift**: Exchange permissions are the source of truth, but manual toggles could become out of sync
3. **Poor User Experience**: Users could enable features in Yieldly that their API key doesn't actually support, leading to confusing errors
4. **Security Risk**: No automatic validation that keys are truly read-only (required for Phase 1)
5. **Maintenance Overhead**: Manual toggles require UI components, validation logic, and user documentation

The fundamental question: Should Yieldly duplicate exchange permission configuration, or should it automatically detect what the API key can do?

## Decision

Implement **automatic API capability detection** instead of manual feature toggles.

When a user adds an exchange connection, Yieldly will:
1. Test the provided API credentials against known endpoints
2. Automatically detect which permissions the key has
3. Store the detected capabilities in the database
4. Display the detected capabilities to the user (read-only view)
5. Use these capabilities to determine feature availability

## Rationale

### Single Source of Truth
- Exchange permissions are the authoritative source
- Eliminates configuration duplication
- No possibility of drift between Yieldly and exchange settings

### Better User Experience
- User configures permissions once (on exchange)
- Yieldly automatically discovers what the key can do
- Clear feedback: "✓ Portfolio Access Detected, ✓ Market Data Access Detected"
- No confusing checkboxes asking users to duplicate exchange configuration

### Automatic Security Validation
- Detects if API key has unexpected permissions (trading, withdrawal)
- Phase 1 requires read-only keys - detection enforces this automatically
- Warning users if key has dangerous permissions they shouldn't have granted

### Reduced Complexity
- No UI components for manual toggles
- No validation logic for checkbox consistency
- No user documentation explaining why they need to set permissions twice

### Future-Proof Design
- Easy to add detection for new capability types
- Supports different permission models across exchanges
- Enables automatic migration when exchange APIs change

## Implementation Details

### Capability Detection Process

```
1. User provides API key and secret
2. Yieldly creates connection with status: TESTING
3. CapabilityDetector runs tests:
   - Test portfolio read: GET /v5/account/wallet-balance
   - Test market data: GET /v5/market/tickers
   - Test historical data: GET /v5/market/kline
   - Test trading: POST /v5/order/create (should fail)
   - Test withdrawal: POST /v5/asset/withdraw (should fail)
4. Store results in detected_capabilities JSONB field
5. Update connection status based on results:
   - ACTIVE: Has required read permissions, no write permissions
   - ERROR: Missing required permissions or has dangerous permissions
6. Display results to user
```

### Database Schema

**broker_connections table:**
```sql
detected_capabilities JSONB NULL
capabilities_detected_at TIMESTAMP NULL
```

**Example detected_capabilities JSON:**
```json
{
  "portfolio_read": true,
  "market_data_read": true,
  "historical_data_read": true,
  "trading": false,
  "withdrawal": false,
  "detected_at": "2025-01-22T10:30:00Z",
  "test_results": {
    "portfolio": {
      "endpoint": "/v5/account/wallet-balance",
      "method": "GET",
      "success": true,
      "status_code": 200,
      "response_time_ms": 145
    },
    "trading": {
      "endpoint": "/v5/order/create",
      "method": "POST",
      "success": false,
      "status_code": 403,
      "error_message": "API key does not have trading permission"
    }
  }
}
```

### New Components

**CapabilityDetector** - Responsible for testing API key permissions
- Tests specific endpoints for each capability
- Returns structured APICapabilities object
- Exchange-agnostic interface

**APICapabilities Domain Model** - Represents detected permissions
```go
type APICapabilities struct {
    PortfolioRead         bool
    MarketDataRead        bool
    HistoricalDataRead    bool
    Trading               bool
    Withdrawal            bool
    DetectedAt            time.Time
    TestResults           map[string]EndpointTestResult
}

func (c APICapabilities) HasAnyReadPermission() bool
func (c APICapabilities) HasDangerousPermissions() bool
```

### API Changes

**New endpoint:**
```
POST /api/v1/broker/connections/{id}/detect-capabilities
```

**Updated response model:**
```json
{
  "connection_id": "uuid",
  "broker": "bybit",
  "status": "active",
  "capabilities": {
    "portfolio_read": true,
    "market_data_read": true,
    "historical_data_read": true,
    "trading": false,
    "withdrawal": false
  },
  "capabilities_detected_at": "2025-01-22T10:30:00Z"
}
```

### UI Changes

**Before (Manual Toggles - Removed):**
```
[ ] Enable Portfolio Sync
[ ] Enable Market Data
[ ] Enable Historical Data
[Connect]
```

**After (Auto-Detection):**
```
[Paste API Key]
[Validate & Connect]

↓ (Automatic detection runs) ↓

✓ Portfolio Access: Enabled
✓ Market Data Access: Enabled  
✓ Historical Data Access: Enabled
⚠ Trading Access: Disabled (as required)
⚠ Withdrawal Access: Disabled (as required)

[Connected]
```

## Consequences

### Positive
- **Reduced User Friction**: One-step configuration instead of two
- **Automatic Validation**: No way to enable features the key doesn't support
- **Security Enforcement**: Automatic detection of non-read-only keys
- **Simpler Codebase**: Removed manual toggle logic from UI and backend
- **Better Error Messages**: Can tell user exactly which permission is missing

### Negative
- **API Call Overhead**: Initial connection requires 5-10 test API calls
- **Detection Delay**: Takes 1-2 seconds to run all capability tests
- **Exchange API Changes**: If exchange changes endpoints, detection logic needs updates

### Neutral
- **Periodic Re-detection**: Should re-run detection during health checks to catch revoked permissions
- **Cache Capabilities**: Store in database to avoid re-testing on every request

## Alternatives Considered

### Alternative 1: Manual Feature Toggles
**Description**: Keep checkboxes for users to manually enable features  
**Rejected Because**: Creates duplicate configuration, poor UX, security risk

### Alternative 2: Assume All Read Permissions
**Description**: Don't detect capabilities, assume all read-only keys have all permissions  
**Rejected Because**: No validation, would lead to confusing errors when permissions are missing

### Alternative 3: User-Declared Permissions
**Description**: Ask user to declare what their key can do  
**Rejected Because**: Users might not know, could lie (intentionally or not), still duplicate config

## Migration Strategy

### Phase 1 (Current Implementation)
- Remove feature toggle fields from UI
- Remove feature toggle columns from database (already done)
- Implement CapabilityDetector
- Add detected_capabilities JSONB field
- Run capability detection on new connections

### Backward Compatibility
- Existing connections without detected_capabilities: Run detection on next health check
- Display "Capabilities being detected..." during migration period

## Monitoring and Alerting

### Metrics to Track
- Capability detection success rate
- Detection duration (should be < 2 seconds)
- Percentage of connections with dangerous permissions detected
- Rate of capability changes on existing connections

### Alerts
- Alert if >10% of detections fail (indicates exchange API issues)
- Alert if any connection detects trading/withdrawal permissions (Phase 1 violation)
- Alert if detection takes >5 seconds (performance degradation)

## References

- **Related ADRs**: 
  - ADR-021: Broker Integration and Connectivity Architecture
  - ADR-007: Security and Access Control
- **Exchange API Documentation**:
  - Bybit API Permissions: https://bybit-exchange.github.io/docs/v5/guide#authentication
  - Binance API Keys: https://www.binance.com/en/support/faq/how-to-create-api-360002502072

## Review and Approval

**Reviewed by**: Solo Developer  
**Approved by**: Solo Developer  
**Implementation Priority**: High (Required for Phase 1)
