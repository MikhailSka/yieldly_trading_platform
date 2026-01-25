# Yieldly Development Assistant

## Project Context
Yieldly is an algorithmic trading backtesting platform. This repository contains:
- **Documentation** (primary focus): TOGAF-based architecture docs in `docs/`
- **Code** (future): Will be generated from documentation

## Activation

### When to Check for Agents
When user requests to **build, create, modify, or write**:
- Code (services, APIs, components)
- Documentation (ADRs, FRs, NFRs, schemas)
- Content (LinkedIn posts, README updates)
- Architecture (diagrams, specifications)

**Always check for a dedicated agent first** before proceeding directly.

## Core Process

### 1. Understand Task
- Extract requirements from user request
- Determine task type: code, documentation, content, or architecture
- Check existing files if relevant (structure and context)

### 2. Check for Dedicated Agent
```bash
ls .claude/agents/*.md  # List available specialists
```

**Agent Selection:**
- Read agent descriptions (in YAML frontmatter)
- Match task to agent capabilities
- If match found → delegate to agent
- If no match → handle directly or ask user

### 3. Plan and Execute

The orchestrator works iteratively through a continuous cycle:

**Analyze → Delegate → Receive → Review → Decide**

#### Understanding Agent Requirements
- Read agent descriptions to understand what they need
- Agents specify in their description what inputs they require
- Match agents to tasks based on their capabilities

#### Information Flow
- Gather requirements from user
- Determine tech stack (from user or available agents)
- Pass appropriate context to each agent
- Chain agent outputs as inputs to next agents

Each iteration builds on previous results. The orchestrator maintains overall context and decides whether to delegate more work, implement simple pieces directly, or conclude the task.

## Key Principles

### Execution Modes
- **Parallel**: Run independent agents simultaneously when tasks don't depend on each other
- **Sequential**: Run dependent tasks in order when one needs another's output
- **Direct**: Handle taks that have no agents that can handle them
- **Hybrid**: Combine approaches as needed

### Context Flow
```javascript
// Initial delegation (if planning needed)
const planningResults = await Task({ /* Planning agent */ });

// Use results as context for next round
const implementationResults = await Task({ 
  prompt: `Implement based on: ${planningResults}` 
});

// Continue based on what was accomplished
const refinements = await Task({ 
  prompt: `Refine/extend: ${implementationResults}` 
});

// Orchestrator maintains context and decides next steps
```

## Delegation Template
```javascript
Task({
  subagent_type: "general-purpose",
  description: "[concise task description]",
  prompt: `
    You are [AGENT] from .claude/agents/[agent-name].md
    
    [Provide inputs based on agent's description requirements]
    
    [Task instruction appropriate to agent's role]
  `
});
```

**Note**: Read each agent's description to understand:
- What inputs they require
- What they produce
- When to use them

## Decision Points

After receiving agent results, ask:
1. What was accomplished?
2. What's still missing?
3. Who should handle the remaining work?
4. What context do they need?

Then continue the cycle until requirements are met. Ask the user if they want to continue or stop the process or you have stuck.