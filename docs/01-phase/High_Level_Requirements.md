# Yieldly - Phase 1 MVP: High-Level Requirements

## As a Trader (Beta Tester/Free User), I want to be able to:

### Account & Profile Management
- **Register and authenticate:**
  - Sign up using invite/referral code
  - Authenticate via email/password
  - Authenticate via Google OAuth
  - Verify my email address
  - Reset my password if forgotten
- **Manage my profile:**
  - Update profile information (name, email, avatar)
  - Set trading experience level (beginner/intermediate/advanced)
  - Add bio/description
  - Configure account settings (theme, language, timezone)
  - Export my data (GDPR compliance)
  - Request account deletion

### Trading Preferences
- **Configure trading defaults:**
  - Set default position size
  - Choose margin/spot preferences
  - Select preferred trading pairs
  - Customize chart settings (default timeframe, chart type)

### Broker Integration
- **Connect to exchanges:**
  - Add Bybit account connection (read-only)
  - Add Binance account connection (read-only)
  - View connection status and health
  - Remove broker connections
  - Manage my exchange API credentials securely

### Market Data Access
- **View real-time market data:**
  - View live price feeds
  - Monitor ticker data
  - See recent trades
  - Access 24-hour statistics
- **View historical market data:**
  - View historical price data (OHLCV)
  - Access trade history
  - Browse available trading pairs/symbols
  - See exchange information

### Portfolio Monitoring
- **Track my portfolio:**
  - View real-time portfolio value across connected exchanges
  - See asset breakdown and allocation
  - Access transaction history
  - Monitor performance metrics (daily/weekly/monthly)
  - View profit and loss calculations (realized/unrealized)
  - Track performance charts
  - Monitor basic risk metrics (drawdown, volatility)

### Strategy Development
- **Create and manage strategies:**
  - Create new trading strategies using code editor
  - Edit existing strategies with syntax highlighting support
  - Validate strategy code before saving
  - Use pre-built strategy templates and examples
  - Access built-in documentation and guides
  - Save and version my strategies
  - View, update, and delete my strategies
  - Add descriptions and documentation to strategies
- **Build strategies with:**
  - Technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands, etc.)
  - Entry and exit rules
  - Stop-loss and take-profit logic
  - Trailing stop functionality
  - Position sizing rules
  - Risk management rules
  - Conditional logic

### Backtesting
- **Test strategies:**
  - Run backtests using historical market data
  - Simulate trades with realistic fees and slippage
  - View comprehensive backtesting results:
    - Profit and loss analysis
    - Trade statistics (total trades, wins, losses)
    - Win rate and profit factor
    - Maximum drawdown
    - Equity curve visualization
  - Generate detailed backtest reports
  - Access complete trade logs

### Media Management
- **Upload and manage media:**
  - Upload profile avatar
  - Save strategy screenshots
  - View my uploaded media files

### Notifications
- **Receive notifications:**
  - Get in-app notifications about:
    - Strategy alerts (errors, completion)
    - System notifications (maintenance, updates)
  - Receive email notifications for important events
  - Configure notification preferences

---

## As an Admin (Platform Owner), I want to be able to:

### User Management
- **Manage user accounts:**
  - View all registered users
  - Search for specific users
  - Suspend or reactivate user accounts
  - Generate invite codes for new users
  - Monitor user quota usage (e.g., backtest limits)

### Data Management
- **Manage market data:**
  - Download historical market data from exchanges for backtesting
  - Configure available data sources
  - Monitor data availability and integrity
  - Manage data storage

### System Configuration
- **Configure platform settings:**
  - Set system-wide configurations
  - Manage user roles and permissions
  - Generate and manage invite codes
  - Configure feature access based on user roles
  - Set resource limits for strategy execution

### Monitoring & Operations
- **Monitor system health:**
  - Track application errors and issues
  - View system logs
  - Monitor platform uptime
  - Check service health status
  - Monitor exchange connection status
  - Track API usage and limits

### Security & Compliance
- **Ensure platform security:**
  - Review user API credential management
  - Monitor session activity
  - Implement account protection measures
  - Process GDPR data requests (export/deletion)