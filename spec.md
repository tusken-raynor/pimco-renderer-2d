# Project Specification Document

## Project Initialization

**When setting up a new project**, the initial agent must configure automated tooling to enforce this specification. If starting from a base template (like Vite), these tools won't be included by default.

### Required Tooling Setup

**1. Install dependencies:**
```bash
npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint prettier vitest @vitest/ui playwright
```

**2. Configure TypeScript strict mode (`tsconfig.json`):**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**3. Create ESLint config (`.eslintrc.json`):**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "indent": ["error", 2],
    "quotes": ["error", "single"],
    "semi": ["error", "always"]
  }
}
```

**4. Create Prettier config (`.prettierrc`):**
```json
{
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**5. Add npm scripts to `package.json`:**
```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "vitest run src/js/**/*.test.ts",
    "test:integration": "vitest run src/tests/integration",
    "test:e2e": "playwright test src/tests/e2e",
    "test:coverage": "vitest run --coverage src/js/**/*.test.ts",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\"",
    "type-check": "tsc --noEmit",
    "validate": "npm run format && npm run lint && npm run type-check && npm run test"
  }
}
```

**6. Create `.prettierignore` and `.eslintignore`:**
```
node_modules
dist
build
coverage
*.config.js
```

### Why This Matters

These tools enforce the specification automatically:
- **TypeScript strict mode**: Forces explicit typing, prevents `any` usage
- **ESLint**: Catches code style violations, naming conventions, common errors
- **Prettier**: Auto-formats code to match indentation and style rules
- **npm scripts**: Provides consistent commands for all agents to run

Agents working in parallel branches will have their code automatically validated and formatted, ensuring compliance even if they don't read the full spec.

---

## Project Structure

### Module Organization

**TypeScript/JavaScript Modules:**
- All TypeScript/JavaScript modules reside in `src/js/`
- Each module has its own dedicated folder
- Entry point is always `index.ts` (for TypeScript) or `index.js` (for JavaScript)
- Example: `src/js/user-validator/index.ts`

**Other Language Modules:**
- CSS/SCSS modules: Similar folder structure in appropriate directory
- C++ modules (.cpp): Similar folder structure in appropriate directory
- Rust modules (.rs): Similar folder structure in appropriate directory
- Each follows the same pattern: dedicated folder with clear entry point

**Standard Module Structure:**
```
src/js/my-module/
  index.ts          # Entry point
  helper.ts         # Supporting files as needed
  index.test.ts     # Unit tests
  docs.md           # Module documentation
```

**Tests Organization:**
```
src/tests/
  integration/
    feature-name.test.ts
    docs.md
  e2e/
    workflow-name.spec.ts
    docs.md
```

---

## Documentation Standards

### Module-Level Documentation

**Every module must have a `docs.md` file** in its folder containing:

**1. Module Purpose (Most Important)**
- Clear, concise description of what this module does
- Why it exists in the project
- What problem it solves

**2. High-Level Implementation Overview**
- How the module works under the hood
- Key algorithms or approaches used
- Important design decisions
- Should be detailed enough for developers to understand without reading all the code

**3. Input/Output Interface**
- Public functions, classes, methods available
- Parameters and return types
- How other parts of the app should connect to this module
- Example usage

**4. Unit Test Documentation**
- What tests exist for this module
- Edge cases covered
- Any testing assumptions

**Example `docs.md` structure:**
```markdown
# User Validator Module

## Purpose
Validates user input for registration and profile updates. Ensures email formats are correct, passwords meet security requirements, and usernames follow naming conventions.

## How It Works
Uses regex patterns for email/username validation and zxcvbn library for password strength checking. All validation rules are centralized here to maintain consistency across the application.

## Interface
### validateEmail(email: string): ValidationResult
- **Input**: Email string
- **Output**: {valid: boolean, error?: string}
- **Example**: `validateEmail('test@example.com')`

### validatePassword(password: string): ValidationResult
- **Input**: Password string
- **Output**: {valid: boolean, strength: number, error?: string}
- **Example**: `validatePassword('SecurePass123!')`

## Tests
- Email validation: tests valid formats, invalid formats, edge cases (empty, whitespace)
- Password validation: tests length requirements, character requirements, strength scoring
- Username validation: tests allowed characters, length limits, reserved names
```

### Project-Level Documentation

**Create `docs.md` in the project root** containing:

**Purpose**: High-level overview for agents to quickly understand the project architecture and key features. This is NOT the same as README.md.

**Contents:**
- Project overview and primary objectives
- High-level architecture (what major systems exist)
- Key modules and their relationships
- Critical user flows
- Technology stack overview
- Any important architectural decisions

**Maintenance:**
- Agents must update this file when adding key features
- Keep it current as the project evolves
- Focus on the "big picture" - don't document every small detail

**Example project `docs.md` structure:**
```markdown
# Project: Task Management System

## Overview
A collaborative task management platform for teams with real-time updates and file attachments.

## Architecture
- Frontend: React with TypeScript
- Backend: Node.js API
- Database: PostgreSQL
- Real-time: WebSocket connections

## Key Modules
- **Authentication** (src/js/auth/): Handles user login, JWT tokens, session management
- **Task Manager** (src/js/task-manager/): CRUD operations for tasks
- **Real-time Sync** (src/js/websocket/): Broadcasts updates to connected clients
- **File Storage** (src/js/file-handler/): Manages file uploads and retrieval

## Critical User Flows
1. User registration → email verification → dashboard access
2. Create task → assign to team member → real-time notification
3. Upload file → attach to task → team member downloads

## Technology Decisions
- Using PostgreSQL over MongoDB for relational data integrity
- JWT for stateless authentication
- WebSockets for real-time features instead of polling
```

---

## Error Handling System

### Error Class Structure

Create standardized error classes in `src/js/errors/index.ts`:

```typescript
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public statusCode: number = 500,
    public context: Record<string, any> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, { field });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, ErrorCode.NOT_FOUND, 404, { resource });
  }
}
```

### Error Handler

Create centralized handler in `src/js/error-handler/index.ts`:

```typescript
class ErrorHandler {
  handle(error: Error, context: Record<string, any> = {}): void {
    // Log error with context
    console.error({
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        code: error.code,
        context: { ...error.context, ...context }
      })
    });

    // Future: Send to tracking service (Sentry, Rollbar, etc.)
    // if (this.trackingService) {
    //   this.trackingService.captureError(error, context);
    // }
  }
}

export const errorHandler = new ErrorHandler();
```

### Usage

```typescript
import { ValidationError, NotFoundError } from '@/js/errors';
import { errorHandler } from '@/js/error-handler';

// In code
if (!email) {
  const error = new ValidationError('Email required', 'email');
  errorHandler.handle(error);
  throw error;
}

// In API routes
try {
  const user = await getUser(id);
  res.json(user);
} catch (error) {
  errorHandler.handle(error as Error);
  
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message }
    });
  }
  
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } });
}
```

### Guidelines

- Always use specific error types (ValidationError, NotFoundError, etc.)
- Include relevant context (userId, resourceId, etc.)
- Pass errors through errorHandler.handle()
- Never log sensitive data (passwords, tokens)
- Never expose internal error details to users

---

## Testing Standards

### Testing Chronology & Workflow

#### Initial Project Setup: Define Test Goals

**When first setting up the project and reviewing the plan**:

1. **For Integration Tests**: Define test goals in `src/tests/integration/docs.md`
   - Identify which system integrations will need testing (API-to-DB, service-to-service, auth flows, etc.)
   - Document what features you expect to test once connections are established
   - Format as "Test Goals" section with placeholders for planned tests

2. **For E2E Tests**: Define test goals in `src/tests/e2e/docs.md`
   - Identify critical user journeys from the project plan
   - Document which workflows will need E2E testing once operational
   - Format as "Test Goals" section with placeholders for planned tests

**Example test goal format:**
```markdown
## Test Goals

### Integration Test: User Authentication Flow
- **When to build**: After auth service connects to database and token generation is implemented
- **What to test**: Login validation, token creation/verification, session management
- **Endpoints involved**: POST /auth/login, POST /auth/refresh, GET /auth/verify

### E2E Test: User Registration Journey
- **When to build**: After registration form, API endpoint, and email confirmation are all functional
- **What to test**: Form submission, validation errors, successful account creation, email verification
- **Success criteria**: User can complete registration from landing page to confirmed account
```

**Purpose**: Test goals help agents understand what testing is needed without forcing premature test creation. They serve as reminders and guides.

#### Phase 1: Build Modules + Unit Tests

**Sequence for each module**:
1. Build module functionality according to project plan
2. **Immediately** write unit tests for that module
3. Document tests in the module's `docs.md`
4. Move to next module

**Why this order?**
- Project plan drives design, not tests
- Tests written while module is fresh in context
- Prevents retroactive test-writing at project end

#### Phase 2: Build Integrations + Integration Tests

**Sequence for each integration**:
1. Build integration between systems (API → DB, Service → Service, Auth → Routes, etc.)
2. **Check integration test goals** in `src/tests/integration/docs.md` for guidance
3. **Immediately** write integration test for that specific connection
4. **Replace the test goal** with actual test documentation in `src/tests/integration/docs.md`
5. Continue building and testing integrations incrementally

**Trigger moments for integration tests**:
- API endpoint connected to database → test that integration
- Authentication wired to protected routes → test that flow
- Service layer connects two modules → test that interaction
- External API integration established → test that connection

**Why this order?**
- Can't test integration before you have things to integrate
- Writing tests while integration is fresh prevents context loss
- Incremental approach prevents rushed testing at the end

#### Phase 3: Build Workflows + E2E Tests

**Sequence for each user journey**:
1. Build complete user workflow according to project plan
2. **Check E2E test goals** in `src/tests/e2e/docs.md` for guidance
3. When workflow is functional end-to-end, **immediately** write E2E test
4. **Replace the test goal** with actual test documentation in `src/tests/e2e/docs.md`
5. Continue as each workflow becomes operational

**When to write E2E tests**:
- As soon as a complete user journey is functional
- Don't wait for all features to be done
- Example: Registration flow works → test it now, even if payment flow isn't ready yet

**Why this order?**
- Need the full flow to exist end-to-end first
- Agent building the flow has best context for testing it
- Incremental E2E testing prevents overwhelming final testing phase

---

### Unit Tests (Vitest)

**What to test**: Any isolated, testable interface
- When you plan a module, you know its interface: public functions, class methods (instance and static), exported utilities
- You know the input parameters and expected output for each interface point
- Write unit tests based on this input/output knowledge

**Requirements**:
- Test all code branches (if/else, switch cases, loops)
- Test edge cases: empty arrays, null/undefined, zero, negative numbers, empty strings
- Test error conditions and exceptions
- Test boundary values (min/max, first/last)
- Aim for 80%+ coverage
- Use descriptive test names: "should reject invalid email format"

**Structure**:
- Each module lives in its own folder with `index.ts` as the entry point
- Create `index.test.ts` (or `test.ts`) in the same module folder
- Use arrange-act-assert pattern
- Each test should be independent and not rely on other tests

**Documentation**:
- Document unit tests in the module's `docs.md` file
- Include what each unit test validates
- Note any important edge cases or assumptions
- Update `docs.md` as you add or modify tests

**Example structure:**
```
src/js/user-validator/
  index.ts
  index.test.ts
  docs.md
```

**Automatic Test Generation Rules:**

When you create a module with an interface → Analyze all entry points (functions, methods, classes):
- Identify each input parameter and its type
- Identify expected output for each input combination
- Write unit tests covering all input/output scenarios
- Document in the module's `docs.md`

---

### Integration Tests (Vitest)

**What to test**: Interactions between multiple parts of the system
- API endpoints (full request/response cycle)
- Database operations (queries, mutations, transactions)
- Service layer interactions
- Authentication/authorization flows
- File system operations
- External API integrations (with mocking)
- Module-to-module communication

**Requirements**:
- Set up test environment (test database, mock services)
- Test complete workflows from entry point to output
- Include setup and teardown (beforeEach/afterEach)
- Test success paths AND failure paths
- Verify side effects (database changes, file creation, etc.)
- Mock external dependencies appropriately

**Key scenarios to always test**:
- Valid input → expected output
- Invalid input → proper error handling
- Unauthorized access → rejection
- Missing required data → validation errors
- Concurrent operations → data consistency

**Structure**:
- Create integration test files in `src/tests/integration/`
- Organize by feature or domain area
- Name files descriptively: `user-registration.test.ts`, `payment-processing.test.ts`

**Documentation**:
- Start with test goals in `src/tests/integration/docs.md` during project setup
- When building tests, replace test goals with actual test documentation
- Describe what system interactions each test validates
- Note any test environment setup requirements
- Update documentation as you build tests

**Automatic Test Generation Rules:**

**If you create an API route** → Write integration tests for:
- All HTTP methods supported
- Valid request → success response
- Invalid/malformed request → 400 error
- Unauthorized request → 401 error
- Non-existent resource → 404 error
- Check test goals, then replace with documentation in `src/tests/integration/docs.md`

**If you add database models/queries** → Write integration tests for:
- CRUD operations
- Constraints and validations
- Relationships and joins
- Transactions and rollbacks
- Check test goals, then replace with documentation in `src/tests/integration/docs.md`

**If you create authentication** → Write tests for:
- Login success/failure
- Token generation/validation
- Password reset flow
- Session management
- Check test goals, then replace with documentation in `src/tests/integration/docs.md`

---

### E2E Tests (Playwright)

**What to test**: Complete user workflows through the UI
- Infer critical user journeys from the existing project plan
- Identify multi-step processes that users must complete
- Test complete flows from start to finish
- Focus on workflows that represent core functionality

**Requirements**:
- Test from the user's perspective
- Use real browser automation
- Test both happy paths and error scenarios
- Verify UI feedback (error messages, success notifications)
- Test across different viewport sizes if responsive

**Coverage goal**: Focus on the most important user workflows identified in the project plan

**Structure**:
- Create E2E test files in `src/tests/e2e/`
- Name files based on the workflow: `user-onboarding.spec.ts`, `data-submission-flow.spec.ts`
- Organize by user journey or feature area

**Documentation**:
- Start with test goals in `src/tests/e2e/docs.md` during project setup
- When building tests, replace test goals with actual test documentation
- Describe the complete user journey each test covers
- Document user journeys step-by-step
- Note any prerequisites or test data requirements
- List the critical paths being validated

**Automatic Test Generation Rules:**

**If you create a form or UI flow** → Write E2E tests for:
- Successful submission
- Validation errors
- Submission failures
- Check test goals, then replace with documentation in `src/tests/e2e/docs.md`

---

### Test Data Management

**Always create**:
- Factory functions or fixtures for generating test data
- Reusable mock data for common entities
- Database seeders for integration tests
- Clear test data that makes tests readable

**Example**:
```typescript
// Create factories like this
const createTestUser = (overrides = {}) => ({
  email: 'test@example.com',
  password: 'Password123!',
  name: 'Test User',
  ...overrides
});
```

---

### Error Handling Tests

For every feature, ensure tests cover:
- What happens when external services are down
- What happens with malformed input
- What happens when resources don't exist
- What happens with duplicate data
- What happens when rate limits are hit

---

### Testing Configuration & Setup

**Initialize testing infrastructure with**:
- Test runner configuration (Vitest)
- Coverage reporting
- Test database setup
- Mock service providers
- CI/CD integration (test commands in package.json)
- Test goal placeholders in integration and E2E docs

**Project structure:**
```
src/js/
  module-name/
    index.ts
    index.test.ts
    docs.md
src/tests/
  integration/
    feature-name.test.ts
    docs.md
  e2e/
    workflow-name.spec.ts
    docs.md
```

**Test scripts:**
```json
{
  "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
  "test:unit": "vitest run src/js/**/*.test.ts",
  "test:integration": "vitest run src/tests/integration",
  "test:e2e": "playwright test src/tests/e2e",
  "test:coverage": "vitest run --coverage src/js/**/*.test.ts"
}
```

**How it works:**
- `test:unit` - Runs all `*.test.ts` files in any module folder under `src/js/`
- `test:integration` - Runs all test files in `src/tests/integration/`
- `test:e2e` - Runs all spec files in `src/tests/e2e/`
- `test` - Runs all three in sequence

---

### Testing Best Practices

1. **Independence**: Tests should not depend on each other or share state
2. **Speed**: Unit tests should be fast (milliseconds), integration tests moderate (seconds)
3. **Clarity**: Test names should clearly describe what's being tested
4. **Maintenance**: Update tests when you change code
5. **No console noise**: Clean up console.log, warnings in tests
6. **Document while building**: Never skip documentation - write it as you create tests
7. **Test goals → Test docs**: Always replace test goals with actual documentation when tests are built

---

### When NOT to Test

- Third-party library internals (trust they're tested)
- Simple getters/setters with no logic
- Framework boilerplate
- Configuration files

---

### Testing Reporting

After generating tests, report:
- Number of tests created (by type)
- Coverage percentage
- Any areas that are difficult to test (and why)
- Confirmation that documentation has been updated
- Test goals that have been replaced with actual test documentation

---

## Code Style & Conventions

### Naming Conventions
- **Variables & Functions**: camelCase (`getUserData`, `isValid`)
- **Classes & Interfaces**: PascalCase (`UserValidator`, `AuthService`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_BASE_URL`)
- **Files**: kebab-case for multi-word files (`user-validator.ts`, `auth-service.ts`)
- **Private members**: Prefix with underscore (`_internalState`)

### File Organization
- Group related imports together
- Order: external libraries → internal modules → types → styles
- One blank line between import groups

**Example:**
```typescript
// External libraries
import { useState, useEffect } from 'react';
import axios from 'axios';

// Internal modules
import { validateEmail } from '@/js/user-validator';
import { AuthService } from '@/js/auth-service';

// Types
import type { User, ValidationResult } from '@/types';

// Styles
import './styles.css';
```

### Indentation
- Use **2 spaces** for indentation (not 4, not tabs)

### Comments
- Use JSDoc comments for public functions and classes
- Inline comments for complex logic only
- Keep comments up-to-date with code changes

---

## Type Safety (TypeScript)

### Strictness
- Enable strict mode in `tsconfig.json`
- No implicit `any` types
- Properly type all function parameters and return values

### Function Arguments
- **ALWAYS explicitly type function arguments**
- Never use `any` for function parameters
- Use specific types or generics

**Example:**
```typescript
// Good
function processUser(user: User, options: ProcessOptions): Result {
  // ...
}

// Bad - never do this
function processUser(user: any, options: any) {
  // ...
}

// Good - use generics when type varies
function transformData<T>(data: T[], transformer: (item: T) => T): T[] {
  // ...
}
```

### Type vs Interface
- Use `interface` for object shapes that may be extended
- Use `type` for unions, intersections, and utility types

### Avoiding `any`
- **Never use `any`** unless absolutely necessary and documented why
- Use `unknown` instead when type is truly unknown
- Use generics to maintain type safety

---

## Dependency Management

### Adding Dependencies
- Evaluate if functionality can be built in-house before adding new dependency
- Prefer well-maintained, popular libraries
- Check bundle size impact
- Document why dependency was added

### Preferred Libraries
*(Add your preferred libraries for common tasks here as project develops)*

---

## Styling Standards

### CSS Approach
- **Do NOT use Tailwind CSS**
- Use normal CSS classes with meaningful names
- Follow BEM naming convention for complex components
- Keep styles modular and scoped to components

**Example:**
```css
/* Good */
.user-card {
  padding: 1rem;
}

.user-card__header {
  font-weight: bold;
}

.user-card--highlighted {
  border: 2px solid blue;
}

/* Avoid Tailwind-style utility classes */
```

### CSS Organization
- One CSS file per module/component
- Group related styles together
- Use CSS custom properties (variables) for theme values

---

## Performance Considerations

### When to Optimize
- Optimize when performance issues are measured, not assumed
- Profile before optimizing
- Document performance-critical code sections

### General Guidelines
- Avoid premature optimization
- Cache expensive computations
- Lazy load when appropriate
- Monitor bundle sizes

---

## Summary

**TL;DR for Agents:**

1. **Structure**: Modules in `src/js/module-name/` with `index.ts` entry point
2. **Documentation**: 
   - Module `docs.md` with purpose, implementation, I/O, and tests
   - Project `docs.md` in root for high-level overview
   - Keep documentation current
3. **Error Handling**:
   - Use AppError class hierarchy with proper error codes
   - Always pass errors through errorHandler.handle()
   - Include relevant context for future tracking service integration
   - Never expose internal error details to users
4. **Testing**:
   - Setup: Define test goals in `src/tests/integration/docs.md` and `src/tests/e2e/docs.md`
   - Phase 1: Build module → write unit tests → document
   - Phase 2: Build integration → write integration tests → replace test goals with docs
   - Phase 3: Build workflow → write E2E tests → replace test goals with docs
   - Use `npm run test` to run all tests sequentially
5. **Code Style**: 2-space indentation, camelCase/PascalCase, no Tailwind
6. **Types**: Strict TypeScript, always explicitly type function arguments, never use `any`
