# Errors Module

## Purpose

This module provides standardized error classes for the multi-threaded 2D product image renderer. All errors extend from `AppError`, which provides:

1. Consistent error structure with codes and context
2. Serialization for logging and debugging
3. Type guards for error handling
4. Proper stack traces and error chaining

## How It Works

### Error Hierarchy

```
Error (built-in)
└── AppError (base class)
    ├── ValidationError   - Invalid input/parameters
    ├── NotFoundError     - Resource not found
    ├── RenderError       - Rendering failures
    ├── AssetLoadError    - Asset loading failures
    ├── WorkerError       - Worker communication failures
    ├── AbortError        - Operation cancelled
    └── CapabilityError   - Browser capability issues
```

### Design Decisions

1. **Error Codes**: Every error has a `code` field for programmatic handling:
   - `VALIDATION_ERROR`
   - `NOT_FOUND`
   - `RENDER_ERROR`
   - `ASSET_LOAD_ERROR`
   - `WORKER_ERROR`
   - `ABORT_ERROR`
   - `CAPABILITY_ERROR`

2. **Context Object**: All errors accept a context object for additional metadata without polluting the message.

3. **Error Chaining**: The `cause` parameter allows wrapping original errors while preserving the stack trace.

4. **Timestamp**: Each error records when it occurred for debugging time-sensitive issues.

## Interface

### Creating Errors

```typescript
import {
  AppError,
  ValidationError,
  NotFoundError,
  RenderError,
  AssetLoadError,
  WorkerError,
  AbortError,
  CapabilityError,
} from '@/js/errors';

// Basic error
throw new AppError('Something went wrong');

// Validation error with field name
throw new ValidationError('Invalid layer order', 'order');

// Not found error
throw new NotFoundError('Asset', 'texture-123');

// Render error with phase and layer ID
throw new RenderError('Effect shader failed', 'effects', 'layer-456');

// Asset load error
throw new AssetLoadError('https://example.com/img.png', 'image');

// Worker error
throw new WorkerError('Worker terminated unexpectedly', 1);

// Abort error
throw new AbortError('Render cancelled by user');

// Capability error
throw new CapabilityError('WebGL2', 'Effects require WebGL2 support');
```

### Handling Errors with Type Guards

```typescript
import { isAppError, isValidationError, isRenderError, isAbortError, wrapError } from '@/js/errors';

try {
  await render(layers);
} catch (error) {
  if (isAbortError(error)) {
    // User cancelled - don't show error
    return;
  }

  if (isValidationError(error)) {
    console.error(`Invalid input: ${error.field}`);
    return;
  }

  if (isRenderError(error)) {
    console.error(`Render failed in phase: ${error.phase}`);
    // Log additional context
    console.error('Layer:', error.layerId);
    console.error('Context:', error.context);
    return;
  }

  // Wrap unknown errors
  const appError = wrapError(error);
  console.error(appError.toString());
}
```

### Error Context

All errors support a context object for additional metadata:

```typescript
throw new RenderError('Failed to apply effect', 'effects', 'layer-123', {
  effect: 'embroidery',
  shaderProgram: 'fuzz',
  glError: 'INVALID_OPERATION',
});
```

### Error Serialization

Errors can be serialized for logging or transmission:

```typescript
const error = new RenderError('Composition failed', 'composition');

// Convert to JSON
const json = error.toJSON();
console.log(JSON.stringify(json, null, 2));

// Output:
// {
//   "name": "RenderError",
//   "message": "Composition failed",
//   "code": "RENDER_ERROR",
//   "context": { "phase": "composition" },
//   "timestamp": "2024-01-15T10:30:00.000Z",
//   "stack": "..."
// }

// Convert to log string
console.log(error.toString());
// Output: [RENDER_ERROR] Composition failed Context: {"phase":"composition"}
```

### Wrapping Unknown Errors

Use `wrapError` to safely wrap any value in an AppError:

```typescript
import { wrapError } from '@/js/errors';

function handleError(error: unknown): void {
  const appError = wrapError(error, 'FETCH_ERROR');

  // Now safely access error properties
  console.log(appError.message);
  console.log(appError.code);

  if (appError.cause) {
    console.log('Original error:', appError.cause);
  }
}
```

## Error Classes Reference

| Class             | Code               | Key Fields                              |
| ----------------- | ------------------ | --------------------------------------- |
| `AppError`        | `APP_ERROR`        | `code`, `context`, `cause`, `timestamp` |
| `ValidationError` | `VALIDATION_ERROR` | `field`                                 |
| `NotFoundError`   | `NOT_FOUND`        | `resourceType`, `resourceId`            |
| `RenderError`     | `RENDER_ERROR`     | `phase`, `layerId`                      |
| `AssetLoadError`  | `ASSET_LOAD_ERROR` | `url`, `assetType`                      |
| `WorkerError`     | `WORKER_ERROR`     | `workerId`                              |
| `AbortError`      | `ABORT_ERROR`      | -                                       |
| `CapabilityError` | `CAPABILITY_ERROR` | `capability`                            |

## Tests

Unit tests cover:

1. **Error Construction**: All error classes with various parameters
2. **Inheritance**: Proper `instanceof` checks
3. **Serialization**: `toJSON()` and `toString()` methods
4. **Type Guards**: All type guard functions
5. **wrapError**: Wrapping various types including null/undefined
6. **Context**: Context object handling
7. **Error Chaining**: Cause parameter preservation

```bash
npm run test:unit -- src/js/errors/index.test.ts
```

Test coverage:

- Error class instantiation with all parameter combinations
- Field preservation (message, code, context, cause)
- Type guard accuracy for all error types
- wrapError with Error, string, null, undefined, number inputs
- JSON serialization output structure
- toString format with and without context
