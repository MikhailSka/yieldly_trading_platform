## Level 1: System Context Diagram

### Purpose
Shows Yieldly in the context of its external dependencies and users. This is the big picture view showing how the system fits into the world around it.

### Diagram Description
The System Context diagram shows:
- **Users**: Beta Testers/Free Users and Admins
- **External Systems**: Bybit Exchange, Binance Exchange, Auth0, SendGrid, Azure Services
- **The Yieldly System**: A single box representing the entire platform

### Key Relationships
- Users interact with Yieldly to develop, test, and manage trading strategies
- Yieldly connects to exchanges (read-only) for market data and portfolio information
- Yieldly uses Auth0 for OAuth authentication
- Yieldly uses SendGrid for email notifications
- Yieldly leverages Azure services for infrastructure (monitoring, storage, key management)

```mermaid
C4Context
    title System Context Diagram for Yieldly Trading Platform

    Person(trader, "Trader", "Beta Tester/Free User who wants to develop and backtest trading strategies")
    Person(admin, "Admin", "Platform administrator managing users, data, and system health")

    System(yieldly, "Yieldly Platform", "Algorithmic trading development and backtesting platform")

    System_Ext(bybit, "Bybit Exchange", "Cryptocurrency exchange providing market data and portfolio API")
    System_Ext(binance, "Binance Exchange", "Cryptocurrency exchange providing market data and portfolio API")
    System_Ext(auth0, "Auth0", "OAuth 2.0 authentication provider")
    System_Ext(sendgrid, "SendGrid", "Email delivery service")
    System_Ext(azure, "Azure Services", "Cloud infrastructure (Monitor, Blob Storage, Key Vault, App Configuration)")

    Rel(trader, yieldly, "Creates strategies, runs backtests, monitors portfolio", "HTTPS/WSS")
    Rel(admin, yieldly, "Manages users, configures system, monitors health", "HTTPS")
    
    Rel(yieldly, bybit, "Fetches market data, portfolio info", "REST API/WebSocket, Read-only")
    Rel(yieldly, binance, "Fetches market data, portfolio info", "REST API/WebSocket, Read-only")
    Rel(yieldly, auth0, "Authenticates users", "OAuth 2.0/OIDC")
    Rel(yieldly, sendgrid, "Sends email notifications", "HTTPS/SMTP")
    Rel(yieldly, azure, "Stores files, manages secrets, monitors system", "Azure SDK")
```
