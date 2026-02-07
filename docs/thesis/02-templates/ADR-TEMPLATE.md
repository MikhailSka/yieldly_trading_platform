# ADR-{NUM}-{DOMAIN}: {Title}

## Status

Proposed | Accepted | Deprecated | Superseded by [[ADR-XXX]]

## Decision

{State the decision clearly in active voice: "We will..."}

## Context

{Describe the forces at play — technical, organizational, constraints.
Value-neutral facts, not opinions. Call out tensions between forces.}

## Consequences

### Positive
- {What becomes easier}
- {What improves}

### Negative
- {What becomes harder}
- {Trade-offs accepted}

## Alternatives Considered

{Optional — include if decision was non-obvious}

### Alternative: {Name}
- **Pros**: {benefits}
- **Cons**: {drawbacks}
- **Why rejected**: {reason}

## Related Documentation

- [[ADR-XXX]] — {Related decision}
- [[FR-XXX]] — {Related requirement}

<!--
@meta
id: ADR-{NUM}-{DOMAIN}
domain: {domain}
scope: {global | service-name}
tags: [{tag1}, {tag2}]
status: proposed
-->

<!--
Template based on:
- Michael Nygard's ADR format (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [[THESIS-ADR-004-naming-and-folder-strategy]] — Naming and folder conventions
- [[THESIS-ADR-005-linking-strategy]] — Metadata and linking

Naming: ADR-{NUM}-{DOMAIN}-{title-in-kebab-case}.md

Domain abbreviations (general architectural concepts):
- SEC   — Security decisions
- API   — API design decisions
- DATA  — Database/data architecture decisions
- INFRA — Infrastructure decisions
- INT   — Integration decisions
- PERF  — Performance decisions
- ARCH  — General architecture

Folder by scope:
- docs/decisions/global/       — Cross-cutting decisions
- docs/decisions/{service}/    — Service-specific decisions
- docs/thesis/01-decisions/    — Thesis methodology (THESIS-ADR-xxx)

Section order: Status, Decision (first for quick reference), Context, Consequences
Keep to 1-2 pages. Write in full sentences.
-->
