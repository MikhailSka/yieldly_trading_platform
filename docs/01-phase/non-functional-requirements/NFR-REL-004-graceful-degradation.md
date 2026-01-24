### NFR-REL-004: Graceful Degradation
**Priority:** Medium
**Requirement:** System must degrade gracefully when non-critical services fail.

**Specifications:**
- Redis cache failure → Fallback to database (slower but functional)
- Notification service failure → Queue notifications, retry later
- Real-time data failure → Display last known prices with warning
- Broker connection failure → Display connection error, allow user retry
