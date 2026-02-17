# AGENT RULES - READ BEFORE STARTING ANY WORK

## Critical Requirements (Always Follow)

### Structure
- **Modules location**: `src/js/module-name/`
- **Module entry point**: Always `index.ts`
- **Tests location**: Unit tests next to modules, integration/e2e in `src/tests/`

### Documentation (Required)
- **Every module**: Must have `docs.md` in its folder with:
  - Purpose (what/why)
  - How it works
  - I/O interface
  - Tests description
- **Project root**: Update `docs.md` when adding key features
- **Test docs**: Replace test goals with actual test documentation

### Testing Workflow
**Phase 1**: Build module → immediately write unit tests → document in module's `docs.md`  
**Phase 2**: Build integration → check test goals → write integration tests → replace goal with docs  
**Phase 3**: Build workflow → check test goals → write e2e tests → replace goal with docs  

**Check test goals before building**:
- `src/tests/integration/docs.md`
- `src/tests/e2e/docs.md`

### TypeScript Rules
- ✅ **ALWAYS** explicitly type function arguments
- ❌ **NEVER** use `any` type
- ✅ Use `unknown` if type truly unknown
- ✅ Use generics for flexible typing

### Code Style
- **Indentation**: 2 spaces (not 4, not tabs)
- **Naming**: camelCase (variables/functions), PascalCase (classes), UPPER_SNAKE_CASE (constants)
- **CSS**: NO Tailwind - use normal CSS with BEM naming
- **Imports**: Group by: external libs → internal modules → types → styles

### Error Handling
- Use `AppError` classes from `src/js/errors/`
- Always call `errorHandler.handle(error)` before throwing
- Include relevant context (userId, resourceId, etc.)
- Never log sensitive data
- Never expose internal errors to users

### Before Committing
Run validation to catch issues:
```bash
npm run validate  # Runs format, lint, type-check, and tests
```

## Quick Reference

**Read full spec**: `/spec.md` (for structural questions or deep dives)

**Test scripts**:
- `npm run test` - Run all tests
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests only
- `npm run test:e2e` - E2E tests only

**File structure template**:
```
src/js/my-module/
  index.ts          # Entry point
  index.test.ts     # Unit tests
  docs.md           # Documentation
```

## Common Mistakes to Avoid

❌ Using `any` for function parameters  
❌ Writing tests at end of project instead of immediately  
❌ Forgetting to document in `docs.md`  
❌ Using 4 spaces or tabs for indentation  
❌ Using Tailwind CSS  
❌ Not checking test goals before building integrations/workflows  
❌ Exposing internal error details to users  

## When You're Done

- [ ] Code formatted (run `npm run format`)
- [ ] All tests passing (run `npm run test`)
- [ ] Documentation updated (module `docs.md` and/or project `docs.md`)
- [ ] Test goals replaced with actual test documentation (if applicable)
- [ ] No TypeScript errors (run `npm run type-check`)
- [ ] No ESLint errors (run `npm run lint`)
