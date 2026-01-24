## ADR-024: Strategy Definition Language & Execution

### Context
Users need to create custom trading strategies using technical indicators, entry/exit rules, and risk management logic. The system must execute user-provided code safely in backtesting without compromising security or platform stability.

**Requirements:**
1. Flexible strategy definition (support various indicators and conditions)
2. Safe code execution (prevent malicious code)
3. Easy to learn for beginners, powerful for advanced users
4. Performant for backtesting (thousands of candles)

### Decision
Use **Python-based DSL** with **RestrictedPython** sandboxing and **Docker container isolation** for strategy execution.

### Strategy DSL Design

**DSL Format: Python-based**

Rationale:
- Leverages existing Python libraries (pandas, numpy, pandas-ta)
- Familiar syntax for many traders
- Flexible and powerful
- Large community and resources

**Strategy Components:**
1. **Data Sources:** Price, volume, indicators
2. **Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, etc.
3. **Entry Rules:** Conditions to open positions
4. **Exit Rules:** Conditions to close positions (stop-loss, take-profit, trailing stop)
5. **Position Sizing:** Fixed amount, percentage of capital, volatility-based
6. **Risk Management:** Max drawdown limits, max open positions

### Code Editor & Builder

**Monaco Editor Integration:**
- Syntax highlighting (Python)
- Auto-completion (indicators, strategy methods)
- Real-time syntax validation
- Inline error messages
- Code folding and minimap

**Built-in Documentation:**
- DSL reference (available indicators, methods)
- Strategy templates (starter code)
- Code examples library
- Interactive help panel

**Validation (Pre-execution):**
- Python syntax check (AST parsing)
- Detect prohibited imports/functions
- Verify required methods present
- Check for common mistakes

### Strategy Execution Sandbox (Security)

User code must be sandboxed to prevent malicious actions through multiple security layers.

#### Layer 1: RestrictedPython

**Restrictions:**
- No `eval()` or `exec()`
- No `open()` (file access)
- No `__import__()` (arbitrary imports)
- No access to `os`, `sys`, `subprocess` modules
- No network access via standard library

**Allowed:**
- Basic Python syntax (if/else, loops, functions)
- Math operations
- pandas, numpy (data manipulation)
- pandas-ta (technical indicators)

#### Layer 2: Docker Container Isolation

**Container Security:**
- Network isolation (--network none)
- Filesystem: read-only except /tmp
- Non-root user execution
- Drop all capabilities

**Resource Limits:**
- Memory: 512MB
- CPU: 0.5 core
- Timeout: 5 minutes maximum
- Disk (tmp): 100MB

**Library Access:**
- Allowed: pandas, numpy, pandas-ta, Python standard library (restricted subset)
- Blocked: requests, urllib, subprocess, os, sys, socket

#### Layer 3: Code Validation (AST Parsing)

**Pre-execution checks:**
- Prohibited imports detection
- Prohibited function calls (eval, exec, open, __import__)
- Excessively nested loops
- Suspicious patterns

### Strategy Execution Workflow

1. User submits backtest request
2. Strategy Service validates strategy code (AST parsing)
3. If validation passes, send job to Backtesting Service
4. Backtesting Service creates isolated Docker container
5. Strategy code + historical data loaded into container
6. RestrictedPython executes strategy in sandbox
7. Strategy generates trades (buy/sell signals)
8. Backtesting engine simulates trades (fee, slippage)
9. Results calculated
10. Container destroyed (cleanup)
11. Results stored in database
12. User notified

**Execution Timeout:**
- Max 5 minutes per backtest
- If timeout exceeded → Kill container, mark as failed

### Strategy Management

**CRUD Operations:**
- Create: Save new strategy to database
- Read: Load strategy for editing or execution
- Update: Save modified strategy (creates new version)
- Delete: Soft-delete strategy

**Versioning:**
- Automatic versioning (v1, v2, v3)
- Version created on every "publish" action
- Users can run backtests on any version
- Version history viewable

**Privacy:**
- Phase 1: All strategies private (no sharing)
- Phase 2+: Optional strategy sharing/marketplace

### Backtesting Engine

**Execution Model:**
- Event-driven backtesting (process candles sequentially)
- No look-ahead bias
- Realistic order execution (next candle open price)

**Fee & Slippage Modeling:**
- Exchange-specific fees (Bybit: 0.1%, Binance: 0.1%)
- Basic slippage: Fixed percentage (0.05% default)
- Advanced slippage (Phase 2+): Volume-based

**Position Tracking:**
- Current position (long, short, flat)
- Entry price, quantity, unrealized P&L
- Multiple open positions support (Phase 2+)

### Performance Optimization

**Data Loading:**
- Pre-load historical data from TimescaleDB
- Cache in memory during backtest
- Use pandas DataFrames (vectorized operations)

**Indicator Calculation:**
- Vectorized operations (pandas/numpy)
- Cache indicator values

**Parallel Backtesting (Phase 2+):**
- Run multiple backtests concurrently
- Use Kubernetes job scaling

### Monitoring & Logging

**Execution Metrics:**
- Backtest duration
- Memory usage
- CPU usage
- Number of trades generated

**Logging:**
- Strategy execution logs (user-visible)
- System logs (errors, warnings)
- Performance logs

**Alerts:**
- Backtest timeout (critical)
- Container creation failed (critical)
- High memory usage (warning)

### Future Enhancements (Phase 2+)

**Visual Strategy Builder (No-Code):**
- Drag-and-drop interface (React Flow)
- Pre-built blocks (indicators, conditions, actions)
- Generates Python code under the hood

**Machine Learning Strategies:**
- Support for ML libraries (scikit-learn, TensorFlow Lite)
- Separate sandbox with higher resource limits
- Model training in cloud

**Live Trading Execution:**
- Connect strategy to live market data
- Execute trades via Broker Connectivity Service
- Real-time portfolio updates
- Risk management automation

### Alternatives Considered

**Option 1: JSON/YAML Configuration**
- Pros: Easier to parse, safer
- Cons: Limited flexibility, hard to express complex logic
- Decision: Rejected - too restrictive

**Option 2: Custom DSL (Proprietary Language)**
- Pros: Full control, maximum security
- Cons: Learning curve, limited ecosystem, high development cost
- Decision: Rejected - not worth effort for solo developer

**Option 3: JavaScript-based DSL**
- Pros: Frontend/backend consistency
- Cons: Weaker data science libraries compared to Python
- Decision: Rejected - Python superior for quantitative analysis
