# FR-STRATEGY-011: Use Indicators in Strategy Code

**Priority:** High
**User Story:** As a trader, I want to use technical indicators in my strategy code so that I can build sophisticated trading algorithms.

**Acceptance Criteria:**
- User can reference indicators by name in strategy code (e.g., `SMA(close, 20)`)
- Code editor provides autocomplete for indicator names
- Code editor shows inline documentation for indicator parameters
- Syntax highlighting for indicator function calls
- User can specify indicator parameters
- User receives clear error messages if indicator used incorrectly
- User can combine multiple indicators in strategy logic
- User can use indicator values in entry/exit conditions

**Example Usage:**
```python
# Simple Moving Average crossover strategy
sma_short = SMA(close, timeperiod=20)
sma_long = SMA(close, timeperiod=50)

# Buy signal when short SMA crosses above long SMA
if sma_short > sma_long and sma_short[1] <= sma_long[1]:
    buy()

# RSI overbought/oversold
rsi = RSI(close, timeperiod=14)
if rsi < 30:
    buy()
elif rsi > 70:
    sell()
```

**Related Features:**
- FR-STRATEGY-001 (Create new strategy)
- FR-STRATEGY-007 (Validate strategy code)
