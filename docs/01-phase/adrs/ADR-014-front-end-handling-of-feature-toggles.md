## ADR-014: Front-End Handling of Feature Toggles

### Context
Feature toggles controlled on back end need reflection in front-end application. Front end must know which features are enabled or disabled for current user.

### Decision
When user logs in or application loads, retrieve feature toggle configuration from back end through API call. On front end, conditionally render components or UI elements based on those flags.

### Rationale
Dynamic UI

Front end adapts in real time based on user permissions/roles
No need for separate routes for different user types
Single codebase handles all user types

Consistent Experience

Only appropriate features visible to each user
Maintains consistency between front end and back end
Prevents confusion from visible but inaccessible features

Flexibility Without Code Changes

No front-end code changes needed to enable/disable features
Toggle changes reflected immediately
No frontend deployment needed for feature changes

Cleaner Architecture

Avoid hardcoded routes for different user types
Conditional rendering based on feature flags
More maintainable codebase

Implementation Approach

API endpoint returns user's feature flags on login/app load
Store feature flags in front-end state management
Use flags to conditionally render components
Check flags before showing UI elements
Disable/hide features not available to user
