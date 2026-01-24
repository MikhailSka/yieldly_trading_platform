# Functional Requirements - Consolidated

This document contains all Functional Requirements for the Yieldly Trading Platform.

**Total Documents:** 65  
**Last Generated:** 2025-11-30T23:58:38.351Z  
**Source Directory:** `functional-requirements`


---

## Table of Contents

1. [FR-ADMIN-001-view-all-users](#fr-admin-001-view-all-users)
2. [FR-ADMIN-002-search-users](#fr-admin-002-search-users)
3. [FR-ADMIN-003-suspend-user-account](#fr-admin-003-suspend-user-account)
4. [FR-ADMIN-004-generate-invite-codes](#fr-admin-004-generate-invite-codes)
5. [FR-ADMIN-005-view-user-quota-usage](#fr-admin-005-view-user-quota-usage)
6. [FR-ADMIN-006-download-market-data](#fr-admin-006-download-market-data)
7. [FR-ADMIN-007-configure-data-sources](#fr-admin-007-configure-data-sources)
8. [FR-ADMIN-008-monitor-system-health](#fr-admin-008-monitor-system-health)
9. [FR-ADMIN-009-view-system-logs](#fr-admin-009-view-system-logs)
10. [FR-ADMIN-010-configure-system-settings](#fr-admin-010-configure-system-settings)
11. [FR-ADMIN-011-manage-technical-indicators](#fr-admin-011-manage-technical-indicators)
12. [FR-AUTH-001-user-registration-with-invite-code](#fr-auth-001-user-registration-with-invite-code)
13. [FR-AUTH-002-user-login](#fr-auth-002-user-login)
14. [FR-AUTH-003-password-reset](#fr-auth-003-password-reset)
15. [FR-AUTH-004-email-verification](#fr-auth-004-email-verification)
16. [FR-AUTH-005-session-management](#fr-auth-005-session-management)
17. [FR-BACKTEST-001-run-backtest](#fr-backtest-001-run-backtest)
18. [FR-BACKTEST-002-view-backtest-results](#fr-backtest-002-view-backtest-results)
19. [FR-BACKTEST-003-view-backtest-history](#fr-backtest-003-view-backtest-history)
20. [FR-BACKTEST-004-generate-backtest-report](#fr-backtest-004-generate-backtest-report)
21. [FR-BACKTEST-005-view-trade-logs](#fr-backtest-005-view-trade-logs)
22. [FR-BACKTEST-006-cancel-running-backtest](#fr-backtest-006-cancel-running-backtest)
23. [FR-BACKTEST-007-check-backtest-quota](#fr-backtest-007-check-backtest-quota)
24. [FR-BACKTEST-008-view-available-indicators-for-backtesting](#fr-backtest-008-view-available-indicators-for-backtesting)
25. [FR-BROKER-001-add-bybit-connection](#fr-broker-001-add-bybit-connection)
26. [FR-BROKER-002-add-binance-connection](#fr-broker-002-add-binance-connection)
27. [FR-BROKER-003-remove-broker-connection](#fr-broker-003-remove-broker-connection)
28. [FR-BROKER-004-view-connection-status-and-health](#fr-broker-004-view-connection-status-and-health)
29. [FR-MARKET-001-view-real-time-price-feeds](#fr-market-001-view-real-time-price-feeds)
30. [FR-MARKET-002-view-recent-trades](#fr-market-002-view-recent-trades)
31. [FR-MARKET-003-view-24-hour-statistics](#fr-market-003-view-24-hour-statistics)
32. [FR-MARKET-004-browse-available-trading-pairs](#fr-market-004-browse-available-trading-pairs)
33. [FR-MARKET-005-view-historical-ohlcv-data](#fr-market-005-view-historical-ohlcv-data)
34. [FR-MEDIA-001-upload-profile-avatar](#fr-media-001-upload-profile-avatar)
35. [FR-MEDIA-002-upload-strategy-screenshot](#fr-media-002-upload-strategy-screenshot)
36. [FR-MEDIA-003-view-uploaded-media](#fr-media-003-view-uploaded-media)
37. [FR-NOTIFY-001-receive-in-app-notifications](#fr-notify-001-receive-in-app-notifications)
38. [FR-NOTIFY-002-receive-email-notifications](#fr-notify-002-receive-email-notifications)
39. [FR-NOTIFY-003-configure-notification-preferences](#fr-notify-003-configure-notification-preferences)
40. [FR-PORTFOLIO-001-view-real-time-portfolio-value](#fr-portfolio-001-view-real-time-portfolio-value)
41. [FR-PORTFOLIO-002-view-asset-breakdown](#fr-portfolio-002-view-asset-breakdown)
42. [FR-PORTFOLIO-003-view-transaction-history](#fr-portfolio-003-view-transaction-history)
43. [FR-PORTFOLIO-004-view-performance-metrics](#fr-portfolio-004-view-performance-metrics)
44. [FR-PORTFOLIO-005-view-profit-and-loss](#fr-portfolio-005-view-profit-and-loss)
45. [FR-PORTFOLIO-006-view-basic-risk-metrics](#fr-portfolio-006-view-basic-risk-metrics)
46. [FR-PORTFOLIO-007-view-performance-charts](#fr-portfolio-007-view-performance-charts)
47. [FR-PORTFOLIO-008-view-historical-portfolio-snapshots](#fr-portfolio-008-view-historical-portfolio-snapshots)
48. [FR-PORTFOLIO-009-view-portfolio-trend-analysis](#fr-portfolio-009-view-portfolio-trend-analysis)
49. [FR-PROFILE-001-view-and-edit-profile-information](#fr-profile-001-view-and-edit-profile-information)
50. [FR-PROFILE-002-set-trading-experience-level](#fr-profile-002-set-trading-experience-level)
51. [FR-PROFILE-003-configure-account-settings](#fr-profile-003-configure-account-settings)
52. [FR-PROFILE-004-configure-trading-preferences](#fr-profile-004-configure-trading-preferences)
53. [FR-PROFILE-005-gdpr-data-export](#fr-profile-005-gdpr-data-export)
54. [FR-PROFILE-006-gdpr-account-deletion](#fr-profile-006-gdpr-account-deletion)
55. [FR-STRATEGY-001-create-new-strategy-via-code-editor](#fr-strategy-001-create-new-strategy-via-code-editor)
56. [FR-STRATEGY-002-edit-existing-strategy](#fr-strategy-002-edit-existing-strategy)
57. [FR-STRATEGY-003-delete-strategy](#fr-strategy-003-delete-strategy)
58. [FR-STRATEGY-004-view-strategy-list](#fr-strategy-004-view-strategy-list)
59. [FR-STRATEGY-005-use-strategy-templates](#fr-strategy-005-use-strategy-templates)
60. [FR-STRATEGY-006-access-built-in-documentation](#fr-strategy-006-access-built-in-documentation)
61. [FR-STRATEGY-007-validate-strategy-code](#fr-strategy-007-validate-strategy-code)
62. [FR-STRATEGY-008-version-strategy](#fr-strategy-008-version-strategy)
63. [FR-STRATEGY-009-add-strategy-description-and-documentation](#fr-strategy-009-add-strategy-description-and-documentation)
64. [FR-STRATEGY-010-browse-available-indicators](#fr-strategy-010-browse-available-indicators)
65. [FR-STRATEGY-011-use-indicators-in-strategy-code](#fr-strategy-011-use-indicators-in-strategy-code)

---

## FR-ADMIN-001: View All Users

**Source File:** `FR-ADMIN-001-view-all-users.md`  
**Path:** `functional-requirements\FR-ADMIN-001-view-all-users.md`

### FR-ADMIN-001: View All Users
**Priority:** High
**User Story:** As an admin, I want to view all registered users so that I can manage the platform.

**Acceptance Criteria:**
- Admin can view complete user list
- Each user displays:
  - User ID
  - Email
  - Name
  - Registration date
  - Last login date
  - Role (Admin, Beta Tester, Free User, Subscriber)
  - Account status (Active, Suspended, Pending Deletion)
  - Broker connections count
  - Strategy count
  - Backtest count
- Admin can sort users by any column
- Admin can search users by email or name
- User list paginated (50 per page)


---

## FR-ADMIN-002: Search Users

**Source File:** `FR-ADMIN-002-search-users.md`  
**Path:** `functional-requirements\FR-ADMIN-002-search-users.md`

### FR-ADMIN-002: Search Users
**Priority:** Medium
**User Story:** As an admin, I want to search for specific users so that I can find accounts quickly.

**Acceptance Criteria:**
- Admin can search users by:
  - Email (exact or partial match)
  - Name (partial match)
  - User ID (exact match)
- Search results displayed in same format as user list
- Search results clickable to view user details
- Search results paginated (50 per page, max 200 per page)
- Admin can sort search results by any column
- Empty search query returns validation error


---

## FR-ADMIN-003: Suspend User Account

**Source File:** `FR-ADMIN-003-suspend-user-account.md`  
**Path:** `functional-requirements\FR-ADMIN-003-suspend-user-account.md`

### FR-ADMIN-003: Suspend User Account
**Priority:** High
**User Story:** As an admin, I want to suspend user accounts so that I can handle policy violations.

**Acceptance Criteria:**
- Admin can suspend user from user detail page
- Admin must provide suspension reason
- System marks account as suspended
- Suspended user cannot log in (receives "Account suspended" message)
- Existing sessions immediately invalidated
- Broker connections automatically disconnected
- Running backtests cancelled
- Admin can view suspension history per user
- Admin can unsuspend account at any time


---

## FR-ADMIN-004: Generate Invite Codes

**Source File:** `FR-ADMIN-004-generate-invite-codes.md`  
**Path:** `functional-requirements\FR-ADMIN-004-generate-invite-codes.md`

### FR-ADMIN-004: Generate Invite Codes
**Priority:** High
**User Story:** As an admin, I want to generate invite codes so that I can control platform access.

**Acceptance Criteria:**
- Admin can generate invite codes from admin panel
- Admin can specify:
  - Number of codes to generate (1-100)
  - Max uses per code (1, unlimited, or custom number)
  - Expiration date (optional)
  - Role assigned to new users (Beta Tester, Free User)
- System generates unique codes (format: YIELDLY-XXXXX-XXXXX)
- Admin can view all generated codes
- Admin can view code usage statistics:
  - Times used
  - Users registered with code
  - Remaining uses
  - Status (active, expired, fully used)
- Admin can revoke codes
- Admin can export codes to CSV


---

## FR-ADMIN-005: View User Quota Usage

**Source File:** `FR-ADMIN-005-view-user-quota-usage.md`  
**Path:** `functional-requirements\FR-ADMIN-005-view-user-quota-usage.md`

### FR-ADMIN-005: View User Quota Usage
**Priority:** Medium
**User Story:** As an admin, I want to view user quota usage so that I can monitor resource consumption.

**Acceptance Criteria:**
- Admin can view quota usage per user:
  - Backtests run this month
  - Total backtests all-time
  - API calls this hour
  - Storage used (media files)
- Admin can view aggregate statistics:
  - Total backtests run across platform (daily, monthly)
  - Average backtests per user
  - Quota violations (users who exceeded limits)
- Admin can adjust quotas for individual users
- Admin can view quota usage trends over time


---

## FR-ADMIN-006: Download Market Data

**Source File:** `FR-ADMIN-006-download-market-data.md`  
**Path:** `functional-requirements\FR-ADMIN-006-download-market-data.md`

### FR-ADMIN-006: Download Market Data
**Priority:** High
**User Story:** As an admin, I want to download historical market data so that it's available for backtesting.

**Acceptance Criteria:**
- Admin can download historical data from admin panel
- Admin must specify:
  - Exchange (Bybit, Binance)
  - Trading pair
  - Timeframe (5m, 15m, 1h, 4h, 1d)
  - Start date
  - End date
- System validates data not already present in database
- System initiates download job (asynchronous)
- System displays download progress
- System stores data in TimescaleDB
- System validates data quality after download
- Admin receives notification when download completes
- Admin can view download job history


---

## FR-ADMIN-007: Configure Data Sources

**Source File:** `FR-ADMIN-007-configure-data-sources.md`  
**Path:** `functional-requirements\FR-ADMIN-007-configure-data-sources.md`

### FR-ADMIN-007: Configure Data Sources
**Priority:** Medium
**User Story:** As an admin, I want to configure data sources so that I can manage which exchanges are available.

**Acceptance Criteria:**
- Admin can enable/disable exchanges:
  - Bybit
  - Binance
- Admin can configure exchange-specific settings:
  - API endpoints
  - Rate limits
  - Supported trading pairs
- Admin can test exchange connectivity
- Changes apply immediately
- System logs all configuration changes


---

## FR-ADMIN-008: Monitor System Health

**Source File:** `FR-ADMIN-008-monitor-system-health.md`  
**Path:** `functional-requirements\FR-ADMIN-008-monitor-system-health.md`

### FR-ADMIN-008: Monitor System Health
**Priority:** High
**User Story:** As an admin, I want to monitor system health so that I can ensure platform stability.

**Acceptance Criteria:**
- Admin can view system health dashboard showing:
  - Service status (all microservices)
  - Database connectivity (PostgreSQL, TimescaleDB, Redis)
  - Azure Service Bus health
  - Azure Blob Storage health
  - Exchange API connectivity (Bybit, Binance)
  - API Gateway status
- Each service displays:
  - Status (Healthy, Degraded, Down)
  - Response time
  - Error rate
  - Last health check timestamp
- Dashboard auto-refreshes every 30 seconds
- Admin can manually trigger health checks
- Historical health data viewable (uptime trends)


---

## FR-ADMIN-009: View System Logs

**Source File:** `FR-ADMIN-009-view-system-logs.md`  
**Path:** `functional-requirements\FR-ADMIN-009-view-system-logs.md`

### FR-ADMIN-009: View System Logs
**Priority:** Medium
**User Story:** As an admin, I want to view system logs so that I can troubleshoot issues.

**Acceptance Criteria:**
- Admin can view centralized logs from Azure Monitor
- Admin can filter logs by:
  - Severity (Debug, Info, Warning, Error, Critical)
  - Service name
  - Time range
  - User ID
  - Request ID
- Logs displayed in chronological order (newest first)
- Admin can search logs by keyword
- Admin can view full log entry details
- Logs retained for 30 days
- Admin can export filtered logs to JSON or CSV


---

## FR-ADMIN-010: Configure System Settings

**Source File:** `FR-ADMIN-010-configure-system-settings.md`  
**Path:** `functional-requirements\FR-ADMIN-010-configure-system-settings.md`

### FR-ADMIN-010: Configure System Settings
**Priority:** Medium
**User Story:** As an admin, I want to configure system-wide settings so that I can control platform behavior.

**Acceptance Criteria:**
- Admin can configure:
  - Feature flags (enable/disable features per role)
  - Default user quotas per role
  - Backtest timeout limits
  - Maximum file upload sizes
  - Session timeout duration
  - Rate limiting thresholds
- Settings stored in Azure App Configuration
- Changes apply immediately (no deployment needed)
- System logs all configuration changes
- Admin can revert to previous configuration


---

## FR-ADMIN-011-manage-technical-indicators

**Source File:** `FR-ADMIN-011-manage-technical-indicators.md`  
**Path:** `functional-requirements\FR-ADMIN-011-manage-technical-indicators.md`

# FR-ADMIN-011: Manage Technical Indicators

**Priority:** Medium
**User Story:** As an admin, I want to manage technical indicators so that I can control which indicators are available to users and provide helpful documentation.

**Acceptance Criteria:**
- Admin can view all technical indicators from TA-Lib library
- Admin can enable/disable indicators for user access
- Admin can add descriptions and usage examples for indicators
- Admin can specify common use cases for each indicator
- Admin can set popular parameter values for indicators
- Admin can trigger manual sync from Backtesting Service to update indicator library
- Admin can categorize indicators (Overlap Studies, Momentum, Volume, Volatility, etc.)
- Changes to indicator metadata immediately reflected in user-facing indicator list
- Admin can view indicator usage statistics (which indicators are most used)

**API Endpoints:**
- `GET /api/v1/admin/indicators` - List all indicators with metadata
- `PUT /api/v1/admin/indicators/:name` - Update indicator metadata
- `POST /api/v1/admin/indicators/sync` - Trigger sync from Backtesting Service
- `GET /api/v1/admin/indicators/:name/usage` - View indicator usage statistics

**Database Tables:**
- `indicator_configs` (Strategy Service database)

**Related Services:**
- Strategy Service (manages indicator configurations)
- Backtesting Service (provides indicator definitions from TA-Lib)


---

## FR-AUTH-001: User Registration with Invite Code

**Source File:** `FR-AUTH-001-user-registration-with-invite-code.md`  
**Path:** `functional-requirements\FR-AUTH-001-user-registration-with-invite-code.md`

### FR-AUTH-001: User Registration with Invite Code
**Priority:** High
**User Story:** As a new user, I want to register using an invite code so that I can create an account on the platform.

**Acceptance Criteria:**
- System must validate invite code before allowing registration
- System must check invite code is active, not expired, and within usage limits
- User must provide valid email address
- User must create password meeting security requirements (min 8 chars, uppercase, lowercase, number, special char)
- System must send email verification link after registration
- Account remains inactive until email is verified
- System must mark invite code as used after successful registration
- System must support Google OAuth as alternative registration method
- CAPTCHA must be presented during registration to prevent bots


---

## FR-AUTH-002: User Login

**Source File:** `FR-AUTH-002-user-login.md`  
**Path:** `functional-requirements\FR-AUTH-002-user-login.md`

### FR-AUTH-002: User Login
**Priority:** High
**User Story:** As a registered user, I want to log in to access my account.

**Acceptance Criteria:**
- User can log in with email/password
- User can log in with Google OAuth
- System must validate credentials against Auth Service database
- System must return JWT token upon successful authentication
- JWT must include user ID, role, and permissions as claims
- Invalid credentials must return clear error message
- System must implement rate limiting (5 failed attempts = 15-minute lockout)
- Session timeout set to 24 hours
- User can have multiple active sessions


---

## FR-AUTH-003: Password Reset

**Source File:** `FR-AUTH-003-password-reset.md`  
**Path:** `functional-requirements\FR-AUTH-003-password-reset.md`

### FR-AUTH-003: Password Reset
**Priority:** Medium
**User Story:** As a user who forgot my password, I want to reset it so that I can regain access to my account.

**Acceptance Criteria:**
- User can request password reset via email
- System generates secure reset token with 1-hour expiration
- System sends password reset email with link containing token
- User can set new password using valid reset token
- System validates new password meets security requirements
- Token can only be used once
- All active sessions must be invalidated after password reset


---

## FR-AUTH-004: Email Verification

**Source File:** `FR-AUTH-004-email-verification.md`  
**Path:** `functional-requirements\FR-AUTH-004-email-verification.md`

### FR-AUTH-004: Email Verification
**Priority:** High
**User Story:** As a new user, I want to verify my email address so that I can fully activate my account.

**Acceptance Criteria:**
- System sends verification email immediately after registration
- Verification email contains unique verification link
- Verification token expires after 24 hours
- User can request new verification email if token expired
- System activates account upon successful email verification
- User cannot log in until email is verified


---

## FR-AUTH-005: Session Management

**Source File:** `FR-AUTH-005-session-management.md`  
**Path:** `functional-requirements\FR-AUTH-005-session-management.md`

### FR-AUTH-005: Session Management
**Priority:** Medium
**User Story:** As a user, I want my sessions to be managed securely so that my account remains protected.

**Acceptance Criteria:**
- System tracks active sessions per user
- Session automatically expires after 24 hours of inactivity
- User can view active sessions in account settings
- User can manually invalidate specific sessions
- JWT tokens must be validated on every API request at gateway level
- Invalid or expired tokens return 401 Unauthorized


---

## FR-BACKTEST-001: Run Backtest

**Source File:** `FR-BACKTEST-001-run-backtest.md`  
**Path:** `functional-requirements\FR-BACKTEST-001-run-backtest.md`

### FR-BACKTEST-001: Run Backtest
**Priority:** High
**User Story:** As a user, I want to run a backtest so that I can evaluate my strategy performance.

**Acceptance Criteria:**
- User can initiate backtest from strategy detail page
- User must configure backtest parameters:
  - Trading pair (e.g., BTCUSDT)
  - Start date
  - End date
  - Initial capital (USD)
  - Timeframe (5m, 15m, 1h, 4h, 1d)
  - Position size in amount or percentage
- System validates backtest parameters
- System checks user backtest quota (role-based)
- System decrements quota upon backtest start
- System queues backtest job to Backtesting Service
- System displays "Backtest Running" status
- System prevents simultaneous backtests (queue them)
- System automatically downloads required historical data if missing
- Backtest executes with realistic fee and slippage modeling
- System updates backtest status in real-time
- System sends notification when backtest completes
- **Backtest results stored in dedicated `backtesting_db` database** (separate from Portfolio Service - see ADR-002)


---

## FR-BACKTEST-002: View Backtest Results

**Source File:** `FR-BACKTEST-002-view-backtest-results.md`  
**Path:** `functional-requirements\FR-BACKTEST-002-view-backtest-results.md`

### FR-BACKTEST-002: View Backtest Results
**Priority:** High
**User Story:** As a user, I want to view backtest results so that I can evaluate strategy performance.

**Acceptance Criteria:**
- User can view detailed backtest results including:
  - **Performance Metrics:**
    - Total return (absolute and percentage)
    - Annualized return
    - Sharpe ratio
    - Maximum drawdown
    - Maximum drawdown duration
  - **Trade Statistics:**
    - Total number of trades
    - Winning trades
    - Losing trades
    - Win rate percentage
    - Average win
    - Average loss
    - Profit factor (gross profit / gross loss)
    - Largest winning trade
    - Largest losing trade
  - **Equity Curve:**
    - Portfolio value over time (chart)
    - Drawdown chart
    - Buy/sell signals on price chart
  - **Trade Log:**
    - Complete list of all trades with entry/exit prices, P&L
- Results displayed in interactive dashboard
- Charts zoomable and interactive
- User can export results to PDF or HTML
- **Implementation Note:** All backtest data (metrics, equity curves, trade logs) retrieved from dedicated `backtesting_db` database (see ADR-002)


---

## FR-BACKTEST-003: View Backtest History

**Source File:** `FR-BACKTEST-003-view-backtest-history.md`  
**Path:** `functional-requirements\FR-BACKTEST-003-view-backtest-history.md`

### FR-BACKTEST-003: View Backtest History
**Priority:** Medium
**User Story:** As a user, I want to view my backtest history so that I can compare different strategy versions.

**Acceptance Criteria:**
- User can view list of all past backtests
- Each backtest displays:
  - Strategy name and version
  - Trading pair
  - Date range tested
  - Initial capital
  - Total return
  - Maximum drawdown
  - Number of trades
  - Backtest run date
  - Status (Completed, Failed, Running)
- User can sort backtests by:
  - Run date (newest/oldest)
  - Total return (highest/lowest)
  - Maximum drawdown (best/worst)
  - Number of trades
- User can filter by:
  - Strategy name
  - Trading pair
  - Status (Completed, Failed, Running)
  - Date range
- User can click to view detailed results
- User can compare two backtests side-by-side
- List paginated (20 per page, max 100 per page)
- Pagination includes total count and page navigation
- **Implementation Note:** Backtest history queried from dedicated `backtesting_db` database (see ADR-002)


---

## FR-BACKTEST-004: Generate Backtest Report

**Source File:** `FR-BACKTEST-004-generate-backtest-report.md`  
**Path:** `functional-requirements\FR-BACKTEST-004-generate-backtest-report.md`

### FR-BACKTEST-004: Generate Backtest Report
**Priority:** Medium
**User Story:** As a user, I want to generate a backtest report so that I can share or save my results.

**Acceptance Criteria:**
- User can generate report from backtest results page
- Report format: HTML (viewable in browser)
- Report includes:
  - Strategy name and version
  - Backtest parameters
  - All performance metrics
  - Equity curve chart (embedded image)
  - Drawdown chart (embedded image)
  - Complete trade log table
  - Summary statistics
- User can download report as standalone HTML file
- User can print report
- Report branded with Yieldly logo
- **Implementation Note:** Report generated from data in dedicated `backtesting_db` database (see ADR-002)


---

## FR-BACKTEST-005: View Trade Logs

**Source File:** `FR-BACKTEST-005-view-trade-logs.md`  
**Path:** `functional-requirements\FR-BACKTEST-005-view-trade-logs.md`

### FR-BACKTEST-005: View Trade Logs
**Priority:** Medium
**User Story:** As a user, I want to view detailed trade logs so that I can understand individual trade decisions.

**Acceptance Criteria:**
- User can view complete trade log for any backtest
- Each trade entry includes:
  - Trade number
  - Entry timestamp
  - Entry price
  - Entry reason (which rule triggered)
  - Exit timestamp
  - Exit price
  - Exit reason (which rule triggered: stop-loss, take-profit, signal)
  - Position size
  - Gross P&L
  - Fees paid
  - Net P&L
  - Return percentage
- Trade log downloadable as CSV
- Trade log filterable by profitable/losing trades
- User can click trade to see chart with entry/exit points highlighted
- **Implementation Note:** Individual trade records stored in `backtest_trades` table in `backtesting_db` database (see ADR-002)


---

## FR-BACKTEST-006: Cancel Running Backtest

**Source File:** `FR-BACKTEST-006-cancel-running-backtest.md`  
**Path:** `functional-requirements\FR-BACKTEST-006-cancel-running-backtest.md`

### FR-BACKTEST-006: Cancel Running Backtest
**Priority:** Low
**User Story:** As a user, I want to cancel a running backtest so that I can stop a long-running test.

**Acceptance Criteria:**
- User can cancel running backtest from backtest status page
- System stops backtest execution immediately
- System marks backtest as "Cancelled" status
- Partial results not saved
- Backtest quota not refunded for cancelled backtests
- System sends notification about cancellation


---

## FR-BACKTEST-007: Check Backtest Quota

**Source File:** `FR-BACKTEST-007-check-backtest-quota.md`  
**Path:** `functional-requirements\FR-BACKTEST-007-check-backtest-quota.md`

### FR-BACKTEST-007: Check Backtest Quota
**Priority:** Medium
**User Story:** As a user, I want to check my backtest quota so that I know how many backtests I can run.

**Acceptance Criteria:**
- User can view current backtest quota from dashboard
- System displays:
  - Total quota for current month (role-based)
  - Backtests used this month
  - Backtests remaining
  - Quota reset date (first day of next month)
- Warning displayed when quota low (< 3 remaining)
- Error message when quota exhausted
- User directed to upgrade if quota exhausted


---

## FR-BACKTEST-008-view-available-indicators-for-backtesting

**Source File:** `FR-BACKTEST-008-view-available-indicators-for-backtesting.md`  
**Path:** `functional-requirements\FR-BACKTEST-008-view-available-indicators-for-backtesting.md`

# FR-BACKTEST-008: View Available Indicators for Backtesting

**Priority:** Medium
**User Story:** As a trader, I want to see which indicators are available for backtesting so that I know what tools I can use in my strategies.

**Acceptance Criteria:**
- User can view list of all indicators supported by backtesting engine
- Indicator list shows technical specifications:
  - Input parameters required
  - Output values produced
  - Parameter ranges (min/max)
  - Default parameter values
- User can test indicator calculations with sample data
- Documentation includes mathematical formulas where relevant
- User can view examples of indicator usage in backtest strategies

**API Endpoints:**
- `GET /api/v1/backtests/indicators` - List all TA-Lib indicators
- `GET /api/v1/backtests/indicators/:name` - Get indicator technical details

**Related Features:**
- FR-STRATEGY-010 (Browse available indicators)
- FR-BACKTEST-001 (Run backtest)


---

## FR-BROKER-001: Add Bybit Connection

**Source File:** `FR-BROKER-001-add-bybit-connection.md`  
**Path:** `functional-requirements\FR-BROKER-001-add-bybit-connection.md`

### FR-BROKER-001: Add Bybit Connection
**Priority:** High
**User Story:** As a user, I want to connect my Bybit account so that I can access my portfolio and market data.

**Acceptance Criteria:**
- User can add Bybit connection via API credentials form
- User must provide API Key and API Secret
- System validates credentials by making test API call
- System stores credentials encrypted in database using Azure Key Vault
- System requests read-only permissions only
- System displays connection status (Connected, Disconnected, Error)
- Connection health checked every 5 minutes
- User can test connection manually at any time
- System displays last successful connection timestamp


---

## FR-BROKER-002: Add Binance Connection

**Source File:** `FR-BROKER-002-add-binance-connection.md`  
**Path:** `functional-requirements\FR-BROKER-002-add-binance-connection.md`

### FR-BROKER-002: Add Binance Connection
**Priority:** High
**User Story:** As a user, I want to connect my Binance account so that I can access my portfolio and market data.

**Acceptance Criteria:**
- User can add Binance connection via API credentials form
- User must provide API Key and API Secret
- System validates credentials by making test API call
- System stores credentials encrypted in database using Azure Key Vault
- System requests read-only permissions only
- System displays connection status (Connected, Disconnected, Error)
- Connection health checked every 5 minutes
- User can test connection manually at any time
- System displays last successful connection timestamp


---

## FR-BROKER-003: Remove Broker Connection

**Source File:** `FR-BROKER-003-remove-broker-connection.md`  
**Path:** `functional-requirements\FR-BROKER-003-remove-broker-connection.md`

### FR-BROKER-003: Remove Broker Connection
**Priority:** Medium
**User Story:** As a user, I want to remove a broker connection so that I can disconnect my exchange account.

**Acceptance Criteria:**
- User can remove any connected broker from account settings
- System displays confirmation dialog before deletion
- System permanently deletes encrypted API credentials from database and Key Vault
- System stops all data synchronization for removed broker
- Portfolio data from removed broker is archived (not deleted)
- User receives confirmation message after successful removal


---

## FR-BROKER-004: View Connection Status and Health

**Source File:** `FR-BROKER-004-view-connection-status-and-health.md`  
**Path:** `functional-requirements\FR-BROKER-004-view-connection-status-and-health.md`

### FR-BROKER-004: View Connection Status and Health
**Priority:** Medium
**User Story:** As a user, I want to view the status of my broker connections so that I know if there are any issues.

**Acceptance Criteria:**
- User can view list of all connected brokers
- Each connection displays:
  - Broker name (Bybit, Binance)
  - Status indicator (Connected, Disconnected, Error)
  - Last successful connection timestamp
  - Health check result
- System updates status automatically every 5 minutes
- User can manually refresh connection status
- Error status displays helpful error message


---

## FR-MARKET-001: View Real-Time Price Feeds

**Source File:** `FR-MARKET-001-view-real-time-price-feeds.md`  
**Path:** `functional-requirements\FR-MARKET-001-view-real-time-price-feeds.md`

### FR-MARKET-001: View Real-Time Price Feeds
**Priority:** High
**User Story:** As a user, I want to view real-time price data so that I can monitor current market conditions.

**Acceptance Criteria:**
- User can view live price updates via WebSocket connection
- Price updates occur in real-time (within 1 second of exchange update)
- User can view ticker data including:
  - Last price
  - 24h high/low
  - 24h volume
  - 24h price change percentage
- User can select trading pair from available symbols
- Prices update automatically without page refresh
- System handles reconnection automatically if WebSocket disconnects


---

## FR-MARKET-002: View Recent Trades

**Source File:** `FR-MARKET-002-view-recent-trades.md`  
**Path:** `functional-requirements\FR-MARKET-002-view-recent-trades.md`

### FR-MARKET-002: View Recent Trades
**Priority:** Low
**User Story:** As a user, I want to view recent trades for a trading pair so that I can see recent market activity.

**Acceptance Criteria:**
- User can view last 50 trades for selected trading pair
- Each trade displays:
  - Timestamp
  - Price
  - Quantity
  - Side (Buy/Sell)
- Trades update in real-time
- System supports filtering by time range


---

## FR-MARKET-003: View 24-Hour Statistics

**Source File:** `FR-MARKET-003-view-24-hour-statistics.md`  
**Path:** `functional-requirements\FR-MARKET-003-view-24-hour-statistics.md`

### FR-MARKET-003: View 24-Hour Statistics
**Priority:** Medium
**User Story:** As a user, I want to view 24-hour statistics for trading pairs so that I can understand daily market movements.

**Acceptance Criteria:**
- User can view 24h statistics including:
  - Opening price
  - High price
  - Low price
  - Closing price
  - Total volume
  - Price change (absolute and percentage)
- Statistics update every minute
- User can view statistics for all available trading pairs
- System displays statistics in sortable table format


---

## FR-MARKET-004: Browse Available Trading Pairs

**Source File:** `FR-MARKET-004-browse-available-trading-pairs.md`  
**Path:** `functional-requirements\FR-MARKET-004-browse-available-trading-pairs.md`

### FR-MARKET-004: Browse Available Trading Pairs
**Priority:** Medium
**User Story:** As a user, I want to browse available trading pairs so that I can find symbols to trade or backtest.

**Acceptance Criteria:**
- User can view complete list of available trading pairs per exchange
- User can search/filter trading pairs by symbol name
- System displays for each pair:
  - Symbol (e.g., BTCUSDT)
  - Base currency (e.g., BTC)
  - Quote currency (e.g., USDT)
  - Exchange (Bybit, Binance)
- List updates daily from exchange metadata
- User can mark favorite pairs for quick access


---

## FR-MARKET-005: View Historical OHLCV Data

**Source File:** `FR-MARKET-005-view-historical-ohlcv-data.md`  
**Path:** `functional-requirements\FR-MARKET-005-view-historical-ohlcv-data.md`

### FR-MARKET-005: View Historical OHLCV Data
**Priority:** High
**User Story:** As a user, I want to view historical price data so that I can analyze past market movements.

**Acceptance Criteria:**
- User can view historical OHLCV (Open, High, Low, Close, Volume) data
- User can select timeframe: 5m, 15m, 1h, 4h, 1d
- User can select date range (up to 2 years historical data)
- System displays data in chart format (candlestick, line, bar)
- User can zoom and pan chart
- Data loads from cache when available (fast)
- System displays loading indicator during data fetch
- Error message shown if data unavailable


---

## FR-MEDIA-001: Upload Profile Avatar

**Source File:** `FR-MEDIA-001-upload-profile-avatar.md`  
**Path:** `functional-requirements\FR-MEDIA-001-upload-profile-avatar.md`

### FR-MEDIA-001: Upload Profile Avatar
**Priority:** Low
**User Story:** As a user, I want to upload a profile avatar so that I can personalize my account.

**Acceptance Criteria:**
- User can upload avatar from profile settings
- Supported formats: JPG, PNG, WEBP
- Maximum file size: 5MB
- System validates file type and size before upload
- System stores original in Azure Blob Storage
- System generates thumbnail (150x150px) automatically
- System replaces existing avatar if uploading new one
- Old avatar deleted from storage
- Avatar displayed throughout application
- Default avatar provided if none uploaded


---

## FR-MEDIA-002: Upload Strategy Screenshot

**Source File:** `FR-MEDIA-002-upload-strategy-screenshot.md`  
**Path:** `functional-requirements\FR-MEDIA-002-upload-strategy-screenshot.md`

### FR-MEDIA-002: Upload Strategy Screenshot
**Priority:** Low
**User Story:** As a user, I want to upload screenshots for my strategies so that I can document visual results.

**Acceptance Criteria:**
- User can upload screenshots from strategy detail page
- Supported formats: JPG, PNG, WEBP
- Maximum file size: 10MB per file
- Maximum 5 screenshots per strategy
- System stores files in Azure Blob Storage
- System displays thumbnails in strategy detail view
- User can click thumbnail to view full-size image
- User can delete screenshots
- Screenshots deleted when strategy deleted


---

## FR-MEDIA-003: View Uploaded Media

**Source File:** `FR-MEDIA-003-view-uploaded-media.md`  
**Path:** `functional-requirements\FR-MEDIA-003-view-uploaded-media.md`

### FR-MEDIA-003: View Uploaded Media
**Priority:** Low
**User Story:** As a user, I want to view all my uploaded media files so that I can manage my content.

**Acceptance Criteria:**
- User can view all uploaded media from account settings
- Media organized by type (avatars, screenshots)
- Each media file displays:
  - Thumbnail
  - File name
  - Upload date
  - File size
  - Associated content (strategy name, etc.)
- User can delete media files
- Total storage usage displayed
- Storage limit: 100MB per user (Phase 1)


---

## FR-NOTIFY-001: Receive In-App Notifications

**Source File:** `FR-NOTIFY-001-receive-in-app-notifications.md`  
**Path:** `functional-requirements\FR-NOTIFY-001-receive-in-app-notifications.md`

### FR-NOTIFY-001: Receive In-App Notifications
**Priority:** Medium
**User Story:** As a user, I want to receive in-app notifications so that I stay informed about important events.

**Acceptance Criteria:**
- User receives in-app notifications for:
  - Backtest completion (success)
  - Backtest failure (with error message)
  - Strategy validation errors
  - Broker connection issues
  - System maintenance announcements
  - Account security alerts (password changed, new login)
- Notifications displayed in notification center (bell icon)
- Unread notifications indicated with badge count
- User can mark notifications as read
- User can delete notifications
- Notifications persist for 30 days
- Real-time notification delivery (within 5 seconds)


---

## FR-NOTIFY-002: Receive Email Notifications

**Source File:** `FR-NOTIFY-002-receive-email-notifications.md`  
**Path:** `functional-requirements\FR-NOTIFY-002-receive-email-notifications.md`

### FR-NOTIFY-002: Receive Email Notifications
**Priority:** Medium
**User Story:** As a user, I want to receive email notifications so that I'm alerted even when not using the platform.

**Acceptance Criteria:**
- User receives email notifications for:
  - Backtest completion (if backtest duration > 5 minutes)
  - Backtest failure
  - Broker connection failed (health check)
  - System maintenance scheduled (24h advance notice)
  - Account security alerts
  - Password reset requests
  - GDPR data export ready
- Emails sent via SendGrid
- Emails branded with Yieldly logo and styling
- Emails include relevant links back to platform
- User can control email frequency in settings


---

## FR-NOTIFY-003: Configure Notification Preferences

**Source File:** `FR-NOTIFY-003-configure-notification-preferences.md`  
**Path:** `functional-requirements\FR-NOTIFY-003-configure-notification-preferences.md`

### FR-NOTIFY-003: Configure Notification Preferences
**Priority:** Low
**User Story:** As a user, I want to configure my notification preferences so that I only receive relevant notifications.

**Acceptance Criteria:**
- User can enable/disable notifications per category:
  - Backtest notifications (in-app, email)
  - Strategy notifications (in-app, email)
  - System notifications (in-app, email)
  - Security notifications (in-app, email - cannot be disabled)
- User can set email notification frequency:
  - Real-time (immediate)
  - Daily digest
  - Weekly digest
  - Disabled (except security)
- Preferences saved to Notification Service database
- Preferences apply immediately
- Security notifications always enabled (cannot be disabled)


---

## FR-PORTFOLIO-001: View Real-Time Portfolio Value

**Source File:** `FR-PORTFOLIO-001-view-real-time-portfolio-value.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-001-view-real-time-portfolio-value.md`

### FR-PORTFOLIO-001: View Real-Time Portfolio Value
**Priority:** High
**User Story:** As a user, I want to view my current portfolio value so that I can track my holdings.

**Acceptance Criteria:**
- User can view total portfolio value in preferred currency (based on profile settings: USD, EUR, BTC, ETH, etc.)
- System aggregates portfolio value across all connected exchanges
- Portfolio value updates in real-time as prices change
- System displays portfolio value per exchange
- System shows value change (absolute and percentage) for 24h, 7d, 30d
- User can temporarily switch display currency without changing profile settings
- Zero balance if no broker connections


---

## FR-PORTFOLIO-002: View Asset Breakdown

**Source File:** `FR-PORTFOLIO-002-view-asset-breakdown.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-002-view-asset-breakdown.md`

### FR-PORTFOLIO-002: View Asset Breakdown
**Priority:** High
**User Story:** As a user, I want to view my asset breakdown so that I can see my holdings composition.

**Acceptance Criteria:**
- User can view all assets held across connected exchanges
- Each asset displays:
  - Asset symbol (e.g., BTC, ETH)
  - Quantity held
  - Current price
  - Total value in preferred currency (based on profile settings: USD, EUR, BTC, ETH, etc.)
  - Percentage of portfolio
  - 24h price change
  - Exchange name
- Assets sorted by total value (descending)
- User can filter by exchange
- User can search by asset symbol
- Display pie chart showing asset allocation
- User can temporarily switch display currency without changing profile settings


---

## FR-PORTFOLIO-003: View Transaction History

**Source File:** `FR-PORTFOLIO-003-view-transaction-history.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-003-view-transaction-history.md`

### FR-PORTFOLIO-003: View Transaction History
**Priority:** Medium
**User Story:** As a user, I want to view my transaction history so that I can track all portfolio changes.

**Acceptance Criteria:**
- User can view complete transaction history from connected exchanges
- Each transaction displays:
  - Timestamp
  - Type (Deposit, Withdrawal, Trade, Fee)
  - Asset
  - Quantity
  - Price (for trades)
  - Exchange
- User can filter by:
  - Date range
  - Transaction type
  - Exchange
  - Asset
- User can export transaction history to CSV
- Transactions paginated (50 per page)
- System syncs new transactions every 15 minutes


---

## FR-PORTFOLIO-004: View Performance Metrics

**Source File:** `FR-PORTFOLIO-004-view-performance-metrics.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-004-view-performance-metrics.md`

### FR-PORTFOLIO-004: View Performance Metrics
**Priority:** Medium
**User Story:** As a user, I want to view my portfolio performance metrics so that I can evaluate my trading results.

**Acceptance Criteria:**
- User can view performance metrics:
  - Total return (absolute and percentage)
  - Daily return
  - Weekly return
  - Monthly return
  - All-time return
- System calculates time-weighted return (TWR) for accurate performance
- User can select time range for performance calculation
- System displays performance chart showing portfolio value over time
- Performance metrics per exchange available


---

## FR-PORTFOLIO-005: View Profit and Loss (P&L)

**Source File:** `FR-PORTFOLIO-005-view-profit-and-loss.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-005-view-profit-and-loss.md`

### FR-PORTFOLIO-005: View Profit and Loss (P&L)
**Priority:** High
**User Story:** As a user, I want to view my profit and loss so that I can understand my trading results.

**Acceptance Criteria:**
- User can view P&L breakdown:
  - Realized P&L (from closed positions)
  - Unrealized P&L (from open positions)
  - Total P&L
- P&L calculated per asset and in total
- User can view P&L for different time periods (24h, 7d, 30d, All-time)
- System displays P&L in USD and percentage
- Color coding: Green for profit, Red for loss
- P&L updates in real-time as prices change


---

## FR-PORTFOLIO-006: View Basic Risk Metrics

**Source File:** `FR-PORTFOLIO-006-view-basic-risk-metrics.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-006-view-basic-risk-metrics.md`

### FR-PORTFOLIO-006: View Basic Risk Metrics
**Priority:** Medium
**User Story:** As a user, I want to view basic risk metrics so that I can understand my portfolio risk.

**Acceptance Criteria:**
- User can view risk metrics:
  - Maximum drawdown (largest peak-to-trough decline)
  - Current drawdown
  - Portfolio volatility (30-day standard deviation)
  - Sharpe ratio (risk-adjusted return)
- System calculates metrics based on historical portfolio data
- User can view metrics for different time periods
- System displays explanatory tooltips for each metric
- Metrics update daily


---

## FR-PORTFOLIO-007: View Performance Charts

**Source File:** `FR-PORTFOLIO-007-view-performance-charts.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-007-view-performance-charts.md`

### FR-PORTFOLIO-007: View Performance Charts
**Priority:** Medium
**User Story:** As a user, I want to view performance charts so that I can visualize my portfolio growth.

**Acceptance Criteria:**
- User can view portfolio value chart over time
- Chart types available: Line, Area
- User can select time range: 24h, 7d, 30d, 3mo, 6mo, 1y, All
- Chart displays:
  - Portfolio value (primary axis)
  - Daily returns (optional secondary axis)
  - Drawdown periods (highlighted)
- User can zoom and pan chart
- Chart updates automatically as new data arrives
- System displays benchmark comparison (e.g., vs Bitcoin) - optional


---

## FR-PORTFOLIO-008-view-historical-portfolio-snapshots

**Source File:** `FR-PORTFOLIO-008-view-historical-portfolio-snapshots.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-008-view-historical-portfolio-snapshots.md`

# FR-PORTFOLIO-008: View Historical Portfolio Snapshots

**Priority:** Medium
**User Story:** As a trader, I want to view my historical portfolio data so that I can track my performance over time.

**Acceptance Criteria:**
- User can view portfolio value history for different time periods:
  - Last 24 hours (hourly snapshots)
  - Last 7 days (hourly snapshots)
  - Last 30 days (hourly snapshots)
  - Last 1 year (daily snapshots)
  - All time (weekly snapshots for data > 1 year old)
- Each snapshot displays:
  - Timestamp
  - Total portfolio value (USD)
  - Realized P&L
  - Unrealized P&L
  - Number of assets
  - Exchange breakdown
- User can compare portfolio value at different points in time
- User can see percentage change between snapshots
- User can export historical data to CSV
- Historical data displayed in table and chart formats

**API Endpoints:**
- `GET /api/v1/portfolio/history?from=<timestamp>&to=<timestamp>&interval=1h`

**Response Format:**
```json
{
  "snapshots": [
    {
      "timestamp": "2025-11-03T14:00:00Z",
      "total_value_usd": 10523.45,
      "realized_pnl": 523.45,
      "unrealized_pnl": 1250.00,
      "asset_count": 3,
      "exchange_count": 2
    }
  ],
  "summary": {
    "total_change_usd": 1523.45,
    "total_change_percent": 16.9,
    "peak_value_usd": 11200.00,
    "max_drawdown_percent": -5.2
  }
}
```

**Related Features:**
- FR-PORTFOLIO-007 (View performance charts)
- FR-PORTFOLIO-004 (View performance metrics)


---

## FR-PORTFOLIO-009-view-portfolio-trend-analysis

**Source File:** `FR-PORTFOLIO-009-view-portfolio-trend-analysis.md`  
**Path:** `functional-requirements\FR-PORTFOLIO-009-view-portfolio-trend-analysis.md`

# FR-PORTFOLIO-009: View Portfolio Trend Analysis

**Priority:** Medium
**User Story:** As a trader, I want to analyze my portfolio trends so that I can understand my trading performance patterns.

**Acceptance Criteria:**
- User can view portfolio growth trends:
  - Daily return distribution
  - Weekly performance comparison
  - Monthly performance summary
  - Best/worst performing periods
- User can view asset allocation trends over time:
  - How asset distribution changed
  - Which assets contributed most to growth
  - Diversification metrics over time
- User can compare their performance to benchmarks:
  - BTC performance
  - ETH performance
  - Custom benchmark
- User can identify patterns:
  - Consecutive winning/losing periods
  - Correlation with market conditions
  - Risk-adjusted returns over time
- Trend data displayed as charts with clear visualizations

**API Endpoints:**
- `GET /api/v1/portfolio/trends?period=30d`
- `GET /api/v1/portfolio/benchmark-comparison?benchmark=BTC`

**Related Features:**
- FR-PORTFOLIO-008 (View historical snapshots)
- FR-PORTFOLIO-006 (View basic risk metrics)


---

## FR-PROFILE-001: View and Edit Profile Information

**Source File:** `FR-PROFILE-001-view-and-edit-profile-information.md`  
**Path:** `functional-requirements\FR-PROFILE-001-view-and-edit-profile-information.md`

### FR-PROFILE-001: View and Edit Profile Information
**Priority:** Medium
**User Story:** As a user, I want to view and edit my profile information so that I can keep my details up to date.

**Acceptance Criteria:**
- User can view current profile information (name, email, avatar, bio)
- User can edit name and bio
- User can upload profile avatar (max 5MB, formats: JPG, PNG, WEBP)
- System stores avatar in Azure Blob Storage
- System generates thumbnail (150x150px) automatically
- Email cannot be changed without verification process
- Changes must be saved to User Profile Service database
- Success/error messages displayed after update


---

## FR-PROFILE-002: Set Trading Experience Level

**Source File:** `FR-PROFILE-002-set-trading-experience-level.md`  
**Path:** `functional-requirements\FR-PROFILE-002-set-trading-experience-level.md`

### FR-PROFILE-002: Set Trading Experience Level
**Priority:** Medium
**User Story:** As a user, I want to set my trading experience level so that the platform can personalize my experience.

**Acceptance Criteria:**
- User can select experience level: Beginner, Intermediate, Advanced
- System stores experience level in user profile
- Beginners see simplified UI and more warnings
- Advanced users see full control and complex features
- System uses experience level for risk defaults and tutorial recommendations
- Experience level can be changed at any time


---

## FR-PROFILE-003: Configure Account Settings

**Source File:** `FR-PROFILE-003-configure-account-settings.md`  
**Path:** `functional-requirements\FR-PROFILE-003-configure-account-settings.md`

### FR-PROFILE-003: Configure Account Settings
**Priority:** Low
**User Story:** As a user, I want to configure my account settings so that the platform works according to my preferences.

**Acceptance Criteria:**
- User can select theme: Light or Dark
- User can select language preference (initially English only)
- User can set timezone from standard timezone list
- Settings persist across sessions
- Settings apply immediately without page refresh
- Default values: Dark theme, English, Browser timezone


---

## FR-PROFILE-004: Configure Trading Preferences

**Source File:** `FR-PROFILE-004-configure-trading-preferences.md`  
**Path:** `functional-requirements\FR-PROFILE-004-configure-trading-preferences.md`

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


---

## FR-PROFILE-005: GDPR Data Export

**Source File:** `FR-PROFILE-005-gdpr-data-export.md`  
**Path:** `functional-requirements\FR-PROFILE-005-gdpr-data-export.md`

### FR-PROFILE-005: GDPR Data Export
**Priority:** Medium
**User Story:** As a user, I want to export all my data so that I can comply with GDPR data portability rights.

**Acceptance Criteria:**
- User can request data export from account settings
- System generates ZIP archive containing:
  - Profile information (JSON)
  - All strategies (JSON)
  - Portfolio history (JSON)
  - Backtest results and history (JSON, from `backtesting_db`)
  - Notification preferences (JSON)
  - Broker connections list (WITHOUT API keys)
- ZIP file available for download for 7 days
- User receives email notification when export is ready
- Export process takes up to 24 hours
- Only one export request allowed per 30 days


---

## FR-PROFILE-006: GDPR Account Deletion

**Source File:** `FR-PROFILE-006-gdpr-account-deletion.md`  
**Path:** `functional-requirements\FR-PROFILE-006-gdpr-account-deletion.md`

### FR-PROFILE-006: GDPR Account Deletion
**Priority:** Medium
**User Story:** As a user, I want to delete my account and all associated data so that I can comply with GDPR right to be forgotten.

**Acceptance Criteria:**
- User can request account deletion from account settings
- System displays warning about permanent data loss
- User must confirm deletion via email link
- Account marked as "pending deletion" for 30 days (grace period)
- User can cancel deletion during grace period
- After 30 days, system permanently deletes:
  - User profile
  - All strategies
  - Portfolio data
  - Broker connections and API keys
  - Notification preferences
  - Media files
  - Auth credentials
- Backtesting results are anonymized (user_id removed) rather than deleted
- Deletion confirmation email sent after completion
- Account cannot be recovered after deletion


---

## FR-STRATEGY-001: Create New Strategy via Code Editor

**Source File:** `FR-STRATEGY-001-create-new-strategy-via-code-editor.md`  
**Path:** `functional-requirements\FR-STRATEGY-001-create-new-strategy-via-code-editor.md`

### FR-STRATEGY-001: Create New Strategy via Code Editor
**Priority:** High
**User Story:** As a user, I want to create a new trading strategy using code so that I can define custom trading logic.

**Acceptance Criteria:**
- User can create new strategy from dashboard
- System displays Monaco code editor with Python syntax highlighting
- Editor pre-populated with starter template code
- User must provide:
  - Strategy name
  - Strategy description (optional)
- User can write strategy using Python-based DSL
- System validates code syntax in real-time
- System highlights syntax errors in editor
- User can save draft (incomplete strategy)
- User can publish strategy (marks as complete)
- System stores strategy in Strategy Service database
- System assigns version number (v1) automatically


---

## FR-STRATEGY-002: Edit Existing Strategy

**Source File:** `FR-STRATEGY-002-edit-existing-strategy.md`  
**Path:** `functional-requirements\FR-STRATEGY-002-edit-existing-strategy.md`

### FR-STRATEGY-002: Edit Existing Strategy
**Priority:** High
**User Story:** As a user, I want to edit my existing strategies so that I can improve or fix them.

**Acceptance Criteria:**
- User can open any owned strategy for editing
- System loads strategy code into Monaco editor
- User can modify strategy name, description, and code
- System validates code syntax in real-time
- User can save changes
- System creates new version (v2, v3, etc.) when published
- User can revert to previous version
- User cannot edit strategies currently running backtests
- System timestamps last edit


---

## FR-STRATEGY-003: Delete Strategy

**Source File:** `FR-STRATEGY-003-delete-strategy.md`  
**Path:** `functional-requirements\FR-STRATEGY-003-delete-strategy.md`

### FR-STRATEGY-003: Delete Strategy
**Priority:** Medium
**User Story:** As a user, I want to delete a strategy so that I can remove strategies I no longer need.

**Acceptance Criteria:**
- User can delete any owned strategy from strategy list
- System displays confirmation dialog before deletion
- System prevents deletion if strategy has running backtests
- System soft-deletes strategy (marks as deleted, preserves in database)
- Deleted strategies hidden from user interface
- Associated backtest results remain available
- Admin can restore deleted strategies if needed


---

## FR-STRATEGY-004: View Strategy List

**Source File:** `FR-STRATEGY-004-view-strategy-list.md`  
**Path:** `functional-requirements\FR-STRATEGY-004-view-strategy-list.md`

### FR-STRATEGY-004: View Strategy List
**Priority:** Medium
**User Story:** As a user, I want to view all my strategies so that I can manage them easily.

**Acceptance Criteria:**
- User can view list of all owned strategies
- Each strategy displays:
  - Strategy name
  - Description (truncated)
  - Version number
  - Last modified date
  - Status (Draft, Published)
  - Number of backtests run
- User can sort strategies by:
  - Name (ascending/descending)
  - Last modified date (newest/oldest)
  - Version number
  - Number of backtests
- User can search strategies by name or description
- User can filter strategies by status (Draft, Published)
- List paginated (20 per page, max 100 per page)
- Pagination includes total count and page navigation


---

## FR-STRATEGY-005: Use Strategy Templates

**Source File:** `FR-STRATEGY-005-use-strategy-templates.md`  
**Path:** `functional-requirements\FR-STRATEGY-005-use-strategy-templates.md`

### FR-STRATEGY-005: Use Strategy Templates
**Priority:** Medium
**User Story:** As a user, I want to use pre-built strategy templates so that I can quickly start building strategies.

**Acceptance Criteria:**
- User can browse strategy template library
- Templates available:
  - Simple Moving Average Crossover
  - RSI Oversold/Overbought
  - MACD Signal Strategy
  - Bollinger Bands Mean Reversion
  - Basic Trend Following
- Each template includes:
  - Complete working code
  - Inline comments explaining logic
  - Default parameters
- User can create new strategy from template
- Template code copied to new strategy (not linked)
- User can modify template code freely


---

## FR-STRATEGY-006: Access Built-In Documentation

**Source File:** `FR-STRATEGY-006-access-built-in-documentation.md`  
**Path:** `functional-requirements\FR-STRATEGY-006-access-built-in-documentation.md`

### FR-STRATEGY-006: Access Built-In Documentation
**Priority:** Medium
**User Story:** As a user, I want to access built-in documentation so that I can learn how to write strategies.

**Acceptance Criteria:**
- User can open documentation panel from code editor
- Documentation includes:
  - DSL syntax reference
  - Available indicators list with parameters
  - Code examples for common patterns
  - Entry/exit rule examples
  - Risk management examples
- Documentation searchable
- Code examples copyable
- Documentation updates without redeploying frontend


---

## FR-STRATEGY-007: Validate Strategy Code

**Source File:** `FR-STRATEGY-007-validate-strategy-code.md`  
**Path:** `functional-requirements\FR-STRATEGY-007-validate-strategy-code.md`

### FR-STRATEGY-007: Validate Strategy Code
**Priority:** High
**User Story:** As a user, I want my strategy code validated so that I know it will execute correctly.

**Acceptance Criteria:**
- System validates code on save and publish
- Validation checks:
  - Python syntax correctness
  - Only allowed libraries imported
  - No prohibited functions (eval, exec, os, subprocess)
  - Required strategy components present (entry rules, exit rules)
  - Proper data source references
- System displays validation errors with line numbers
- User cannot publish strategy with validation errors
- User can save draft with validation errors
- Validation runs in background (non-blocking)


---

## FR-STRATEGY-008: Version Strategy (Git like)

**Source File:** `FR-STRATEGY-008-version-strategy.md`  
**Path:** `functional-requirements\FR-STRATEGY-008-version-strategy.md`

### FR-STRATEGY-008: Version Strategy (Git like)
**Priority:** Medium
**User Story:** As a user, I want my strategies versioned so that I can track changes and revert if needed.

**Acceptance Criteria:**
- System automatically creates new version when strategy published
- Version format: v1, v2, v3, etc.
- User can view version history
- User can view code differences between versions
- User can revert to previous version (creates new version with old code)
- User can run backtests on any version
- System tracks version creation timestamp


---

## FR-STRATEGY-009: Add Strategy Description and Documentation

**Source File:** `FR-STRATEGY-009-add-strategy-description-and-documentation.md`  
**Path:** `functional-requirements\FR-STRATEGY-009-add-strategy-description-and-documentation.md`

### FR-STRATEGY-009: Add Strategy Description and Documentation
**Priority:** Low
**User Story:** As a user, I want to add descriptions to my strategies so that I can document my trading logic.

**Acceptance Criteria:**
- User can add strategy description (markdown supported)
- User can add strategy tags for categorization
- User can document:
  - Strategy purpose
  - Expected market conditions
  - Risk level
  - Recommended parameters
- Description displayed in strategy detail view
- Description searchable
- Description versioned with strategy code


---

## FR-STRATEGY-010-browse-available-indicators

**Source File:** `FR-STRATEGY-010-browse-available-indicators.md`  
**Path:** `functional-requirements\FR-STRATEGY-010-browse-available-indicators.md`

# FR-STRATEGY-010: Browse Available Indicators

**Priority:** High
**User Story:** As a trader, I want to browse available technical indicators so that I can choose appropriate indicators for my trading strategy.

**Acceptance Criteria:**
- User can view list of all enabled technical indicators
- Each indicator displays:
  - Full name and abbreviation
  - Category (Overlap Studies, Momentum, Volume, Volatility)
  - Description of what the indicator measures
  - Usage example code snippet
  - Common use cases
  - Required parameters with descriptions
  - Popular parameter values
- User can filter indicators by category
- User can search indicators by name or description
- User can view detailed information for each indicator
- Indicator list updates when admin enables/disables indicators
- Indicators displayed in user-friendly format suitable for non-technical users

**API Endpoints:**
- `GET /api/v1/indicators` - List enabled indicators
- `GET /api/v1/indicators/:name` - Get detailed indicator information

**UI Components:**
- Indicator browser/selector
- Indicator detail panel with documentation
- Category filter
- Search functionality

**Related Features:**
- FR-STRATEGY-001 (Create new strategy)
- FR-STRATEGY-005 (Use strategy templates)


---

## FR-STRATEGY-011-use-indicators-in-strategy-code

**Source File:** `FR-STRATEGY-011-use-indicators-in-strategy-code.md`  
**Path:** `functional-requirements\FR-STRATEGY-011-use-indicators-in-strategy-code.md`

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

