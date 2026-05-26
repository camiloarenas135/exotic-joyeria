---
name: code-correction
description: "Diagnose and fix code errors systematically. Use when: debugging a runtime error, fixing TypeScript/syntax errors, resolving API integration issues, performance problems, security vulnerabilities, or logical bugs. Covers syntax, types, functionality, performance, integration, configuration, and security issues."
---

# Code Correction & Error Diagnosis

Expert workflow for identifying, analyzing, and fixing code errors across all layers (syntax, types, logic, integration, performance, security).

## When to Use This Skill

- You have a **concrete error** (runtime error, compiler error, build failure, unexpected behavior)
- You need to **diagnose** the root cause before applying fixes
- You want a **systematic approach** to avoid missed context or incomplete solutions
- The error spans **multiple files** or layers (frontend, backend, database, config)
- You need **confidence** that the fix is correct and doesn't introduce new issues

## Workflow Phases

### Phase 1: Error Capture & Context Gathering
**Goal:** Collect all relevant information before attempting diagnosis.

1. **Extract Error Details**
   - Error message or description (exact text if available)
   - Stack trace or reproduction steps
   - When it occurs (on startup, on user action, intermittent)
   - Affected file(s) and line numbers

2. **Identify Error Category**
   - [ ] Syntax/Parse error (code won't compile/run)
   - [ ] Type error (TypeScript/type mismatch)
   - [ ] Runtime error (crash/exception thrown)
   - [ ] Logic error (wrong behavior, unexpected output)
   - [ ] Integration error (API, database, external service)
   - [ ] Configuration error (missing env, wrong settings)
   - [ ] Performance error (speed, memory, timeout)
   - [ ] Security error (vulnerability, unauthorized access)

3. **Gather Code Context**
   - Read the affected file(s) completely if <200 lines, else targeted sections
   - Execute semantic search if error context isn't obvious from the file
   - Check related imports, dependencies, and configuration
   - Review recent changes (git diff) if available

4. **Collect Environmental Context**
   - Framework/library versions (TypeScript, React, Node.js, etc.)
   - Build output (compiler output, error logs)
   - Runtime logs or console output
   - Configuration files (.env, tsconfig.json, package.json, etc.)

### Phase 2: Root Cause Analysis
**Goal:** Pinpoint the exact cause, not just the symptom.

1. **Map the Error Location**
   - Find where in code execution the error occurs
   - Trace backward through call stack or execution path
   - Identify which function/module is responsible

2. **Ask Diagnostic Questions**
   - Is this a known issue or edge case not handled?
   - Are assumptions about data types/structure incorrect?
   - Is a dependency missing, outdated, or misconfigured?
   - Are there environment-specific issues (dev vs test vs prod)?
   - Is the code path even reachable in normal execution?

3. **Identify Contributing Factors**
   - Direct cause (the immediate problem)
   - Indirect causes (why the direct cause exists)
   - Environmental factors (config, dependencies, permissions)
   - Timing/race conditions if applicable

### Phase 3: Solution Design
**Goal:** Plan fixes that are minimal, safe, and well-tested.

1. **Generate Multiple Approaches** (if applicable)
   - Quick fix (surgical, minimum change)
   - Proper fix (addresses root cause fully)
   - Preventive measures (guard against recurrence)

2. **Evaluate Tradeoffs**
   - Scope of change (single file vs multiple files)
   - Risk level (breaking changes? affects other parts?)
   - Performance impact
   - Maintainability and clarity

3. **Choose the Optimal Solution**
   - Default: Proper fix + preventive measures
   - Exception: Quick fix if time-critical, with TODO to improve

### Phase 4: Implementation & Validation
**Goal:** Apply fixes and verify they work.

1. **Apply Fixes**
   - Make targeted, minimal changes
   - Use `replace_string_in_file` or `multi_replace_string_in_file` for edits
   - Preserve formatting and style consistency
   - Include 3-5 lines of context before/after changes for clarity

2. **Building/Compilation Check**
   - Run `npm run build` or `tsc` to verify syntax/types
   - Check console for new errors introduced
   - Verify no regressions in compilation

3. **Runtime Validation**
   - Execute the corrected code path if possible
   - Use command-line tests, logs, or breakpoints
   - Verify the original error is resolved
   - Test edge cases if the fix handles special inputs

4. **Code Review**
   - Are variable names clear?
   - Is the fix understandable to teammates?
   - Are there comments needed?
   - Does it follow project conventions?

5. **Regression Testing**
   - Run existing unit/integration tests if available
   - Spot-check related functionality
   - Verify performance isn't degraded

## Decision Tree

```
Error occurs?
├─ Can you reproduce it? (Yes → Phase 1; No → Collect more context)
├─ Is it a syntax error? (Yes → Fix syntax, compile; No → Phase 2)
├─ Is it a type error? (Yes → Add types or fix type mismatches; No → Phase 2)
├─ Is it a runtime error?
│  ├─ Stack trace visible? (Yes → Analyze trace; No → Add logging, re-run)
│  └─ Is null/undefined? (Yes → Add nullchecks; No → Phase 2)
├─ Is it a logic error?
│  └─ Unit test the function? (Yes → Debug test; No → Write test first)
├─ Is it an integration error?
│  └─ Is external service accessible? (Yes → Check contract/format; No → Check connectivity)
└─ Is it performance/security?
   └─ Phase 3 (design optimal fix)
```

## Completion Checklist

- [ ] Error fully understood (message, stack trace, reproduction steps)
- [ ] Root cause identified (not just symptom treated)
- [ ] Fix applied and code compiles without errors
- [ ] Original error is resolved (testing done)
- [ ] No new errors or warnings introduced
- [ ] Existing tests still pass (if applicable)
- [ ] Code review passed (formatting, clarity, conventions)
- [ ] Edge cases handled (if applicable)
- [ ] Preventive measures added (comments, guards, or tests)

## Example Prompts to Trigger This Skill

> "/code-correction: Fix TypeError: Cannot read property 'name' of undefined"

> "/code-correction: My TypeScript build is failing with 5 errors related to JSON parsing"

> "/code-correction: The API integration is timing out. Help diagnose and fix."

> "/code-correction: Performance issue—app is slow on first load. Analyze and optimize."

> "/code-correction: I found a SQL injection vulnerability in my login API. Patch it."

---

## Quick Reference: Common Error Patterns

| Pattern | Cause | Fix |
|---------|-------|-----|
| `Cannot read property X of undefined` | Null/undefined object access | Add null-check or optional chaining |
| `Type 'X' is not assignable to type 'Y'` | Type mismatch | Cast, convert, or fix type definition |
| `Module not found: 'X'` | Missing dependency or import path | Install package or fix import path |
| `Unexpected token` | Syntax error | Check brackets, semicolons, quotes |
| `Request timeout` | Slow/unreachable endpoint | Add timeout handling, check connectivity |
| `State is stale in effect` | Missing dependency in useEffect | Add all dependencies to dep array |
| `Infinite loop` | Loop condition never false | Review condition or add counter |
| `Port already in use` | Another process on that port | Kill process or use different port |

---

## Principles

1. **Understand Before Fixing** — Root cause analysis prevents treating symptoms.
2. **Minimal Changes** — Only change what's necessary; avoid scope creep.
3. **Test Everything** — Compile, test the fix, check for regressions.
4. **Document & Prevent** — Add comments/tests so the error doesn't recur.
5. **Ask for Clarity** — If error details are missing or unclear, gather more context first.
