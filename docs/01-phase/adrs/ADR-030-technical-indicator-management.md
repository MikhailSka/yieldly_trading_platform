# ADR-030: Technical Indicator Management Architecture

**Status:** Accepted  
**Date:** 2025-11-03

## Context
Users need access to technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands, etc.) to build trading strategies. The platform must:
- Provide a comprehensive library of technical indicators
- Allow users to browse available indicators with descriptions
- Enable admins to manage indicator metadata (descriptions, examples, enable/disable)
- Use industry-standard indicator calculations (TA-Lib library)
- Expose indicators to frontend for strategy building
- Maintain indicator definitions across Backtesting and Strategy services

## Decision
Implement a **distributed indicator management system** where:
1. **Backtesting Service** owns the technical indicator library (TA-Lib) and provides raw indicator definitions
2. **Strategy Service** manages indicator configurations, metadata, and exposes curated indicators to frontend
3. **Admins** can enable/disable indicators and add documentation through Strategy Service
4. **Frontend** fetches indicator list from Strategy Service for strategy building

## Architecture Overview

### Component Ownership

**Backtesting Service:**
- Interface with TA-Lib (or pandas-ta)
- Provide list of available indicators with technical specifications
- Calculate indicator values during backtest execution
- Expose indicator definitions via REST API

**Strategy Service:**
- Fetch indicator definitions from Backtesting Service
- Cache most common indicators locally in `strategy_db`
- Store indicator metadata (descriptions, examples, active status)
- Expose curated indicator list to frontend
- Allow admins to manage indicator configurations

### Data Flow

```
TA-Lib Library → Backtesting Service (Indicator Library Manager)
                         ↓
            REST API (/api/v1/backtests/indicators)
                         ↓
            Strategy Service (Indicator Manager)
                         ↓
            strategy_db (cached indicators + metadata)
                         ↓
            REST API (/api/v1/indicators)
                         ↓
                    Frontend
```

## Backtesting Service: Indicator Library Manager

### Responsibilities
- Interface with TA-Lib to list available indicators
- Provide technical specifications (parameters, return types)
- Calculate indicator values during backtest execution

### Component: Indicator Library Manager

```python
class IndicatorLibraryManager:
    """Manages interface to TA-Lib indicator library"""
    
    def list_indicators(self) -> List[IndicatorDefinition]:
        """Get all indicators from TA-Lib"""
        pass
    
    def get_indicator_details(self, indicator_name: str) -> IndicatorDefinition:
        """Get details for specific indicator"""
        pass
    
    def calculate_indicator(self, indicator_name: str, 
                          data: pd.DataFrame, 
                          params: Dict) -> pd.Series:
        """Calculate indicator values for given data"""
        pass
```

### API Endpoints

```
GET /api/v1/backtests/indicators
  - List all available indicators from TA-Lib
  - Returns technical specifications
  
GET /api/v1/backtests/indicators/:name
  - Get details for specific indicator
  - Returns parameters, return type, calculation method
```

### Response Example

```json
{
  "indicators": [
    {
      "name": "SMA",
      "full_name": "Simple Moving Average",
      "category": "Overlap Studies",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000
        }
      ],
      "input": ["close"],
      "output": ["sma"],
      "function": "talib.SMA"
    },
    {
      "name": "RSI",
      "full_name": "Relative Strength Index",
      "category": "Momentum Indicators",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 14,
          "min": 2,
          "max": 100000
        }
      ],
      "input": ["close"],
      "output": ["rsi"],
      "function": "talib.RSI"
    },
    {
      "name": "BBANDS",
      "full_name": "Bollinger Bands",
      "category": "Overlap Studies",
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 5,
          "min": 2,
          "max": 100000
        },
        {
          "name": "nbdevup",
          "type": "float",
          "default": 2.0
        },
        {
          "name": "nbdevdn",
          "type": "float",
          "default": 2.0
        }
      ],
      "input": ["close"],
      "output": ["upperband", "middleband", "lowerband"],
      "function": "talib.BBANDS"
    }
  ]
}
```

## Strategy Service: Indicator Manager

### Responsibilities
- Fetch indicator definitions from Backtesting Service
- Cache most common indicators in `strategy_db`
- Store admin-curated metadata (descriptions, examples, active status)
- Expose indicators to frontend with user-friendly documentation
- Manage indicator visibility (enable/disable)

### Component: Indicator Manager

```go
type IndicatorManager struct {
    backtestingClient *BacktestingServiceClient
    repository        *IndicatorRepository
    cache             *redis.Client
}

// Fetch indicators from Backtesting Service
func (im *IndicatorManager) SyncIndicators() error {}

// Get indicator list for frontend
func (im *IndicatorManager) GetIndicators(onlyActive bool) ([]Indicator, error) {}

// Get indicator details with examples
func (im *IndicatorManager) GetIndicatorDetails(name string) (*IndicatorDetails, error) {}

// Update indicator metadata (admin only)
func (im *IndicatorManager) UpdateIndicatorMetadata(name string, metadata IndicatorMetadata) error {}
```

### API Endpoints

```
GET /api/v1/indicators
  - List curated indicators for users
  - Returns indicators with descriptions and examples
  - Filter: ?active=true (only enabled indicators)
  
GET /api/v1/indicators/:name
  - Get detailed indicator information
  - Includes usage examples and parameter guidance
  
PUT /api/v1/admin/indicators/:name
  - Update indicator metadata (admin only)
  - Can enable/disable, add descriptions, examples
  
POST /api/v1/admin/indicators/sync
  - Trigger sync from Backtesting Service (admin only)
```

### Response Example (Frontend-Facing)

```json
{
  "indicators": [
    {
      "name": "SMA",
      "full_name": "Simple Moving Average",
      "category": "Overlap Studies",
      "description": "The Simple Moving Average (SMA) is a technical indicator that calculates the average price over a specified period. It smooths out price data to identify trend direction.",
      "active": true,
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000,
          "description": "Number of periods to calculate average"
        }
      ],
      "usage_example": "sma_20 = SMA(close, timeperiod=20)",
      "common_use_cases": [
        "Identify trend direction",
        "Generate buy/sell signals when price crosses SMA",
        "Support/resistance levels"
      ],
      "popular_periods": [10, 20, 50, 100, 200]
    },
    {
      "name": "RSI",
      "full_name": "Relative Strength Index",
      "category": "Momentum Indicators",
      "description": "RSI measures the speed and magnitude of price changes. Values range from 0-100. Above 70 indicates overbought conditions, below 30 indicates oversold.",
      "active": true,
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 14,
          "min": 2,
          "max": 100000,
          "description": "Number of periods for RSI calculation"
        }
      ],
      "usage_example": "rsi = RSI(close, timeperiod=14)",
      "common_use_cases": [
        "Identify overbought/oversold conditions",
        "Divergence trading",
        "Momentum confirmation"
      ],
      "popular_periods": [14, 21, 28],
      "thresholds": {
        "overbought": 70,
        "oversold": 30
      }
    }
  ]
}
```

## Database Schema

### Strategy Service: indicator_configs table

```sql
CREATE TABLE indicator_configs (
    indicator_id UUID PRIMARY KEY,
    indicator_name VARCHAR(50) NOT NULL UNIQUE, -- 'SMA', 'RSI', etc.
    full_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    usage_example TEXT,
    common_use_cases JSONB, -- Array of strings
    active BOOLEAN DEFAULT true,
    technical_spec JSONB NOT NULL, -- From Backtesting Service
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_indicator_configs_active ON indicator_configs(active);
CREATE INDEX idx_indicator_configs_category ON indicator_configs(category);
```

### Example Row

```sql
INSERT INTO indicator_configs VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'SMA',
    'Simple Moving Average',
    'Overlap Studies',
    'The Simple Moving Average (SMA) is a technical indicator that calculates the average price over a specified period.',
    'sma_20 = SMA(close, timeperiod=20)',
    '["Identify trend direction", "Generate buy/sell signals", "Support/resistance levels"]',
    true,
    '{"parameters": [...], "input": ["close"], "output": ["sma"]}',
    NOW(),
    NOW()
);
```

## Synchronization Strategy

### Initial Sync (On Deployment)
```
1. Strategy Service starts up
2. Calls Backtesting Service: GET /api/v1/backtests/indicators
3. Stores all indicators in strategy_db with default active=true
4. Admin can then customize descriptions and enable/disable
```

### Periodic Sync (Weekly)
```
1. Cron job triggers indicator sync
2. Fetch indicators from Backtesting Service
3. Update technical_spec for existing indicators
4. Add new indicators (if TA-Lib updated)
5. Preserve admin customizations (descriptions, active status)
```

### Cache Strategy
- Cache most common indicators (top 20) in Redis
- TTL: 24 hours
- Invalidate on admin update

## Admin Workflow

### Enabling/Disabling Indicators
```
1. Admin views all indicators: GET /api/v1/admin/indicators
2. Admin disables complex indicator (e.g., ULTOSC)
3. PUT /api/v1/admin/indicators/ULTOSC
   Body: { "active": false }
4. Strategy Service updates indicator_configs
5. Frontend no longer shows ULTOSC in indicator list
```

### Adding Descriptions and Examples
```
1. Admin edits indicator: PUT /api/v1/admin/indicators/RSI
   Body: {
     "description": "RSI measures momentum...",
     "usage_example": "rsi = RSI(close, 14)",
     "common_use_cases": ["Overbought/oversold", "Divergence"],
     "popular_periods": [14, 21, 28]
   }
2. Strategy Service updates indicator_configs
3. Users see enhanced documentation in UI
```

## Frontend Integration

### Strategy Builder UI
```javascript
// Fetch indicators for dropdown
fetch('/api/v1/indicators?active=true')
  .then(response => response.json())
  .then(data => {
    // Populate indicator selector
    data.indicators.forEach(indicator => {
      addIndicatorOption(indicator.name, indicator.full_name);
    });
  });

// Show indicator details on selection
fetch('/api/v1/indicators/RSI')
  .then(response => response.json())
  .then(indicator => {
    // Display description, parameters, examples
    showIndicatorHelp(indicator);
  });
```

### Code Editor Autocomplete
- Strategy Service can provide indicator list for IDE autocomplete
- Include parameter hints from indicator definitions
- Show inline documentation from indicator descriptions

## Performance Considerations

### Caching Strategy
- **Redis Cache** (24-hour TTL)
  - Most common indicators cached
  - Invalidate on admin update
  
- **Database Storage**
  - All indicators stored in `strategy_db`
  - Indexed on active status and category

### Query Optimization
- Frontend queries filtered by active=true
- Category-based filtering for large indicator lists
- Pagination for admin views (if > 100 indicators)

## Security Considerations

### Admin-Only Operations
- Only admins can:
  - Enable/disable indicators
  - Update descriptions and metadata
  - Trigger manual sync from Backtesting Service

### Validation
- Indicator names must match TA-Lib definitions
- Parameter types validated before saving
- SQL injection prevention on indicator queries

## TA-Lib Indicator Categories

**Overlap Studies:**
- SMA, EMA, WMA, DEMA, TEMA, TRIMA
- KAMA, MAMA, T3
- BBANDS (Bollinger Bands)
- SAR (Parabolic SAR)

**Momentum Indicators:**
- RSI, STOCH (Stochastic), STOCHF
- MACD, MACDEXT, MACDFIX
- CCI (Commodity Channel Index)
- MOM (Momentum), ROC (Rate of Change)
- WILLR (Williams %R)
- ADX, ADXR, DX

**Volume Indicators:**
- AD (Accumulation/Distribution)
- ADOSC (Chaikin A/D Oscillator)
- OBV (On Balance Volume)

**Volatility Indicators:**
- ATR (Average True Range)
- NATR (Normalized ATR)
- TRANGE (True Range)

**Price Transform:**
- AVGPRICE, MEDPRICE, TYPPRICE, WCLPRICE

**Pattern Recognition:**
- CDL patterns (50+ candlestick patterns)

## Example: Most Common Indicators to Cache

**Top 20 Most Used Indicators (Cache in Redis):**
1. SMA (Simple Moving Average)
2. EMA (Exponential Moving Average)
3. RSI (Relative Strength Index)
4. MACD (Moving Average Convergence Divergence)
5. BBANDS (Bollinger Bands)
6. ATR (Average True Range)
7. STOCH (Stochastic Oscillator)
8. ADX (Average Directional Index)
9. CCI (Commodity Channel Index)
10. MOM (Momentum)
11. ROC (Rate of Change)
12. WILLR (Williams %R)
13. OBV (On Balance Volume)
14. SAR (Parabolic SAR)
15. STDDEV (Standard Deviation)
16. AROON (Aroon Indicator)
17. TRIX (Triple Exponential Average)
18. KAMA (Kaufman Adaptive Moving Average)
19. HT_TRENDLINE (Hilbert Transform - Instantaneous Trendline)
20. LINEARREG (Linear Regression)

## Future Enhancements

### Phase 2
- **Custom Indicators**: Allow users to define custom indicators in Python
- **Indicator Backtesting**: Test individual indicators across multiple assets
- **Indicator Combinations**: Suggest indicator combinations that work well together
- **Performance Analytics**: Track which indicators are most used/successful

### Phase 3
- **ML-Based Indicator Selection**: Recommend indicators based on market conditions
- **Indicator Optimization**: Auto-tune indicator parameters for specific assets

## Consequences

**Positive:**
- Clean separation of concerns (calculation vs management)
- Admins can curate user experience
- Backtesting Service remains focused on execution
- Strategy Service provides user-friendly interface
- Cache strategy reduces load on both services
- Easy to update indicator metadata without code changes
- Frontend gets comprehensive indicator documentation

**Negative:**
- Requires synchronization between services
- Additional database storage in Strategy Service
- Potential sync delays for new indicators

**Mitigation:**
- Automated sync jobs
- Admin can trigger manual sync
- Redis caching reduces query load
- Clear API contracts between services

## Related ADRs
- ADR-017: Service Division and Boundaries
- ADR-024: Strategy Definition Language and Execution
- ADR-029: API Design Patterns and Standards
