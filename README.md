# Yieldly

**Algorithmic Trading Backtesting Platform**

> A safety-first trading laboratory for retail traders — build, test, and validate trading strategies before risking real capital.

[![Status](https://img.shields.io/badge/status-WIP%20Documentation-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## About This Project

Yieldly is an invite-only algorithmic trading platform designed for retail traders who want to develop and backtest trading strategies using real market data. Phase 1 focuses exclusively on **backtesting and strategy development** — connecting to exchanges (Bybit, Binance) in read-only mode to ensure complete capital safety.

**Key Features (Phase 1 MVP):**

- Professional-grade backtesting engine with realistic fee/slippage modeling
- Dual-path strategy creation:
  - **Python code editor** with syntax highlighting and built-in technical indicators
  - **Visual drag-and-drop builder** for no-code strategy assembly
- Multi-exchange portfolio monitoring (read-only)
- Real-time and historical market data access
- Comprehensive performance analytics (win rate, drawdown, profit factor, equity curves)

---

## Project Status

> **Work in Progress** — This repository contains architectural documentation. Implementation will begin after documentation review and approval.

### What Has Been Done

I started drafting comprehensive application documentation based on the **TOGAF methodology**, with the intention of using it alongside AI (Claude, Claude Code) to generate the application code. The documentation follows a structured approach aligned with the **C4 model** for architecture visualization.

The documentation covers the complete system from high-level business context down to low-level specifications:

- **Business context** — Platform description, high-level requirements, user stories
- **Architecture decisions** — ADRs covering infrastructure, security, API design, database choices
- **Requirements** — Functional requirements (per domain) and non-functional requirements
- **Technical specifications** — Database schemas (DBML), class diagrams (Mermaid), C4 diagrams (Level 1-3)
- **Process documents** — Detailed workflows for each service (pending refactoring)

### Current Challenge

The process documents were created to improve AI comprehension, but the current approach needs refinement. The goal is to create documentation that is:

- **Readable for both AI and humans** — Clear structure that works for LLM processing and human navigation
- **Freedom-preserving for developers** — Detailed code examples can restrict implementation choices and imply a single "right" way. As documentation author, I don't need to specify code-level details — developers are the experts in writing code
- **General but accurate** — Keep process descriptions that capture all necessary dependencies (requirements, decisions, specifications) while giving implementation freedom to both AI and human developers

The next step is refactoring process documents into extended functional requirements that maintain this balance and smaller spec like OpenAPI.

---

## Master's Thesis Research

This project serves as a case study for my Master's thesis at the Polish-Japanese Academy of Information Technology (PJATK), Warsaw.

### Thesis Details

| | |
|---|---|
| **Title** | Optimizing Architectural Documentation for Human-AI Collaboration in Software Development — A Fintech Platform Case Study |
| **Program** | Master's in Information Management, specialization: Information Systems Architecture |
| **Expected Completion** | 2027 |

### Research Question

*How does documentation structure affect AI code generation accuracy and integration error rates?*

### Hypothesis

Layered documentation with explicit source-of-truth hierarchy (Specifications → Requirements → Decisions) reduces AI-generated integration errors by 50%+ compared to unstructured or example-heavy documentation.

### Methodology

1. Create comprehensive documentation using structured approach (TOGAF-based)
2. Generate MVP code using LLMs (Claude, Claude Code)
3. Measure: integration errors, rework cycles, requirement compliance
4. Compare with: (a) previous prototype iteration, (b) literature benchmarks

### Expected Contributions

- Quantified error reduction metrics with structured documentation
- Reusable documentation methodology for AI-assisted development
- Guidelines for "source of truth" separation in technical documentation

### Related Work

- TOGAF (The Open Group Architecture Framework)
- C4 Model (Simon Brown)
- Architecture Decision Records (Michael Nygard)

---

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Backend** | Go, Python (backtrader, TA-Lib, pandas) |
| **Frontend** | Next.js, TypeScript, Tailwind CSS |
| **Database** | PostgreSQL, TimescaleDB, Redis |
| **Infrastructure** | Azure, Docker |
| **Authentication** | Auth0, JWT |

---

### Architecture

For detailed architecture diagrams, mind maps, and visual documentation:

**[View on Miro Board](https://miro.com/app/board/uXjVJ60pwsk=/?share_link_id=303132175683)**

---

## Roadmap

### Current Phase: Documentation Refinement

- [ ] Refactor PROC files → Extended Functional Requirements
- [ ] Implement new naming convention (scope/area prefixes for ADRs)
- [ ] Add Obsidian-compatible wiki-links for document navigation
- [ ] Restructure folder hierarchy
- [ ] Create OpenAPI specifications
- [ ] Review infrastructure architecture (based on AWS/Azure best practices)

### Next Phase: Implementation

- [ ] Set up development environment
- [ ] Implement core services using AI-assisted code generation
- [ ] Measure and document integration error rates
- [ ] Compare results with hypothesis

---

## Author

**Mikhail Skarakhodau**
- About Me: Business Solutions Architect at Arxma GmbH (Germany) Designs SAP Business One integrations across 12 European countries
- Background: Full-stack development, microservices architecture
- Languages: JavaScript/TypeScript, Go, Python
- LinkedIn: https://www.linkedin.com/in/mikhail-skarakhodau-9b1404253/
- Location: Warsaw, Poland

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue)](https://www.linkedin.com/in/mikhail-skarakhodau-9b1404253/)

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.