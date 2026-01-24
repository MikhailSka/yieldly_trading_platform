### FR-PROFILE-004: Configure Trading Preferences
**Priority:** Medium
**User Story:** As a user, I want to configure my default trading preferences so that strategy creation is faster.

**Acceptance Criteria:**
- User can set default position size:
  - Absolute value (numeric with currency, e.g., 1000 USD)
  - Percentage of portfolio (e.g., 5% of total portfolio value)
- User can select default margin/spot preference
- User can select preferred trading pairs (multi-select from available symbols)
- User can set default chart timeframe (1m, 5m, 15m, 1h, 4h, 1d)
- User can set default chart type (Candlestick, Line, Bar)
- User can set preferred display currency (USD, EUR, BTC, ETH) for portfolio values
- Preferences pre-populate strategy builder and backtest forms
- Preferences can be overridden per strategy

**Note:** In Phase 1 (backtesting only), percentage-based position sizing is calculated from the backtesting initial capital. In Phase 2+ (live trading), this will need to be refined to represent "percentage of available trading assets" (e.g., free USDT or BTC on a specific exchange that the user designates for trading), not the entire portfolio value. The percentage should be calculated from these specifically allocated trading assets on the exchange where the strategy is being executed.
