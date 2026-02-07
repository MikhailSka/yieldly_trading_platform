# FR-{DOMAIN}-{NUM}: {Title}

## Overview

| Field | Value |
|-------|-------|
| **ID** | FR-{DOMAIN}-{NUM} |
| **Domain** | {Domain name} |
| **Status** | Draft / Review / Approved |
| **Priority** | Must / Should / Could |

## User Story

As a {role}, I want to {action} so that {benefit}.

## Business Context

{Why this feature exists. What business problem it solves.
How it fits into the overall user workflow. This helps AI understand
the PURPOSE, not just the mechanics.}

## Functional Description

{What the system must do. High-level description of the feature behavior.}

## Data Requirements

{Explicit fields, types, constraints, and purpose. This section is CRITICAL
for AI to generate correct database schemas and API contracts.}

| Field | Type | Required | Constraints | Purpose |
|-------|------|----------|-------------|---------|
| `field_name` | string | Yes | max 255 chars, unique | Brief purpose |
| `another_field` | timestamp | Yes | auto-generated | Brief purpose |

{For complex entities, use prose format:}

**Entity Name:**
- `field` (type, required/optional, constraints)
  - Purpose: Why this field exists
  - Default: Default value if any
  - Example: "Example value"

## Business Rules

{Domain logic that governs the feature behavior. Separated from acceptance criteria
to make rules explicit and findable.}

- {Rule 1: e.g., "Email addresses are case-insensitive"}
- {Rule 2: e.g., "Users cannot log in until email is verified"}
- {Rule 3: e.g., "Verification tokens expire after 24 hours"}

## Acceptance Criteria

{Testable behavior requirements. Use Given-When-Then or simple statements.}

- [ ] Given {precondition}, when {action}, then {expected result}
- [ ] {Simple criterion 2}
- [ ] {Simple criterion 3}

## Error Scenarios

{What happens when things go wrong. Edge cases and exception handling.
Critical for AI to generate complete error handling.}

| Scenario | Error Response | Notes |
|----------|----------------|-------|
| {Invalid input} | {Error message} | {Security/UX considerations} |
| {Missing data} | {Error message} | {Recovery options} |

{Or use prose format:}

- {Scenario 1} → {How the system responds}
- {Scenario 2} → {How the system responds}

## Related Documentation

- [[ADR-XXX]] — {Related architectural decision}
- [[NFR-XXX]] — {Related quality constraint}
- [[FR-XXX]] — {Related functional requirement}
- [[schema.dbml]] — {Related database schema}

<!--
@meta
id: FR-{DOMAIN}-{NUM}
domain: {domain}
roles: [{role1}, {role2}]
tags: [{tag1}, {tag2}]
related-services: [{service1}]
status: draft
-->

<!--
Template based on:
- [[THESIS-ADR-003-functional-requirements-detail-level]] — FR format rationale
- [[THESIS-ADR-004-naming-and-folder-strategy]] — Naming conventions
- [[THESIS-ADR-005-linking-strategy]] — Metadata and linking

Naming: FR-{DOMAIN}-{NUM}-{title-in-kebab-case}.md
Domain is project-specific (folder is source of truth for available domains).

Key principles:
- Explicit over Implicit: State all data fields with types and constraints
- Descriptive over Prescriptive: Focus on WHAT/WHY, not HOW
- Business-Focused Language: Explain domain concepts and rules

Required sections: Business Context, Data Requirements, Business Rules,
Acceptance Criteria, Error Scenarios, Related Documentation
-->
