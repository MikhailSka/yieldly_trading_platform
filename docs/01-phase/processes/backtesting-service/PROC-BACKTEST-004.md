### PROC-BACKTEST-004: Expose Raw Indicator Library Data

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-030, ADR-032

#### Overview

This endpoint exposes **raw indicator data directly from the TA-Lib library**. It is primarily used by the Strategy Service for indicator synchronization (PROC-INDICATOR-004).

**Important Notes:**
- This endpoint returns raw library data, NOT user-facing indicator information
- User-facing indicator data (with descriptions, categories, examples) is managed in the Strategy Service
- Admin configures indicators in Strategy Service after sync

#### Trigger
Strategy Service requests raw indicator definitions for sync comparison

#### Actor
Strategy Service (system call) - Internal service-to-service communication

#### Preconditions
- TA-Lib library is installed and configured
- Caller has valid service-to-service authentication

#### Inputs
**API Endpoint:** `GET /api/v1/backtesting/indicators`

**Query Parameters:**
```
GET /api/v1/backtesting/indicators?library={talib|pandas_ta|all}
```

**Parameter Details:**
- `library` (string, default: talib): Which library to query
  - `talib`: TA-Lib indicators (currently supported)
  - `pandas_ta`: Pandas TA indicators (future)
  - `all`: All available libraries

#### Process Steps

1. **API Gateway receives request** → Routes to Backtesting Service
2. **Backtest Controller validates request**
   - Validate library parameter
   - Return 400 if invalid library specified
3. **Indicator Library Manager fetches all functions from TA-Lib**
   ```python
   import talib

   indicators = []
   for func_name in talib.get_functions():
       try:
           func = talib.abstract.Function(func_name)
           info = func.info
           indicators.append({
               "name": func_name,
               "fullName": info.get('display_name', func_name),
               "group": info['group'],
               "technicalSpec": {
                   "parameters": extract_parameters(info),
                   "inputs": info['input_names'],
                   "outputs": info['output_names'],
                   "function": f"talib.{func_name}"
               }
           })
       except Exception as e:
           # Log and skip problematic indicator
           logger.warning(f"Failed to load indicator {func_name}: {e}")
   ```
4. **Cache Manager checks/updates cache**
   - Cache key: `indicators:raw:{library}`
   - TTL: 24 hours (library rarely changes)
5. **Return raw indicator definitions**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "library": "talib",
    "libraryVersion": "0.4.24",
    "indicators": [
      {
        "name": "SMA",
        "fullName": "Simple Moving Average",
        "group": "Overlap Studies",
        "technicalSpec": {
          "parameters": [
            {
              "name": "timeperiod",
              "type": "integer",
              "default": 30,
              "min": 2,
              "max": 100000
            }
          ],
          "inputs": ["close"],
          "outputs": ["real"],
          "function": "talib.SMA"
        }
      },
      {
        "name": "RSI",
        "fullName": "Relative Strength Index",
        "group": "Momentum Indicators",
        "technicalSpec": {
          "parameters": [
            {
              "name": "timeperiod",
              "type": "integer",
              "default": 14,
              "min": 2,
              "max": 100000
            }
          ],
          "inputs": ["close"],
          "outputs": ["real"],
          "function": "talib.RSI"
        }
      },
      {
        "name": "MACD",
        "fullName": "Moving Average Convergence/Divergence",
        "group": "Momentum Indicators",
        "technicalSpec": {
          "parameters": [
            {"name": "fastperiod", "type": "integer", "default": 12, "min": 2, "max": 100000},
            {"name": "slowperiod", "type": "integer", "default": 26, "min": 2, "max": 100000},
            {"name": "signalperiod", "type": "integer", "default": 9, "min": 1, "max": 100000}
          ],
          "inputs": ["close"],
          "outputs": ["macd", "macdsignal", "macdhist"],
          "function": "talib.MACD"
        }
      }
    ],
    "totalCount": 158,
    "groups": [
      "Overlap Studies",
      "Momentum Indicators",
      "Volume Indicators",
      "Volatility Indicators",
      "Price Transform",
      "Cycle Indicators",
      "Pattern Recognition"
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "cached": true,
    "cacheExpires": "2024-12-02T12:00:00Z"
  }
}
```

**Error Response (400 - Invalid Library):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_LIBRARY",
    "message": "Invalid library specified",
    "details": {
      "requested": "unknown_lib",
      "supported": ["talib", "pandas_ta", "all"]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- All TA-Lib indicators retrieved from library
- Technical specifications extracted accurately
- Response properly cached
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid library | 400 | Return "Invalid library. Supported: talib, pandas_ta, all" |
| TA-Lib not installed | 500 | Log error, return "Indicator library unavailable" |
| Library load error | 500 | Log error, return partial results if possible |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Expected Execution Time**: P95 < 500ms (uncached), < 50ms (cached)
- **Cache Strategy**: Cache for 24 hours (library content rarely changes)
- **Cache Key**: `indicators:raw:{library}`
- **Response Size**: ~150 indicators, ~50KB response

#### Dependencies

**Libraries:**
- TA-Lib (technical analysis library) - Core dependency

**Cache:**
- Redis - Response caching for performance

#### Notes

**Purpose:**
This endpoint serves as the **source of truth** for what indicators are available in the backtesting engine. It does NOT provide:
- User-friendly descriptions (admin adds these in Strategy Service)
- Categories (admin assigns these in Strategy Service)
- Usage examples (admin writes these in Strategy Service)
- Active/inactive status (managed in Strategy Service)

**Data Flow:**
```
TA-Lib Library
     ↓
PROC-BACKTEST-004 (this process - exposes raw data)
     ↓
PROC-INDICATOR-004 (Strategy Service - syncs and stores)
     ↓
Admin configures indicators (description, category, examples)
     ↓
Admin activates indicators
     ↓
Users see indicators in strategy editor
```

**Consistency:**
The technical_spec from this endpoint is what the backtesting engine actually uses. The Strategy Service must sync with this to ensure indicators work correctly during backtests.

---
