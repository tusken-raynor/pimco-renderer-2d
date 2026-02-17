/**
 * Standardized error classes for the renderer module.
 * All errors extend AppError which provides consistent structure and context.
 */

/**
 * Error context type for additional metadata.
 */
export type ErrorContext = Record<string, unknown>;

/**
 * Base error class for all application errors.
 * Provides consistent structure with error codes and context.
 */
export class AppError extends Error {
  /** Error code for categorization and programmatic handling */
  public readonly code: string;
  /** Additional context about the error */
  public readonly context: ErrorContext;
  /** Original error if this wraps another error */
  public override readonly cause: Error | undefined;
  /** Timestamp when the error occurred */
  public readonly timestamp: Date;

  constructor(
    message: string,
    code = 'APP_ERROR',
    context: ErrorContext = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.cause = cause;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? this.cause.message : undefined,
    };
  }

  /**
   * Create a string representation suitable for logging.
   */
  override toString(): string {
    const contextStr = Object.keys(this.context).length > 0
      ? ` Context: ${JSON.stringify(this.context)}`
      : '';
    return `[${this.code}] ${this.message}${contextStr}`;
  }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends AppError {
  /** The field or parameter that failed validation */
  public readonly field: string | undefined;

  constructor(
    message: string,
    field?: string,
    context: ErrorContext = {}
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      field !== undefined ? { ...context, field } : context
    );
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends AppError {
  /** The type of resource that was not found */
  public readonly resourceType: string;
  /** The identifier of the resource that was not found */
  public readonly resourceId: string;

  constructor(
    resourceType: string,
    resourceId: string,
    context: ErrorContext = {}
  ) {
    super(
      `${resourceType} not found: ${resourceId}`,
      'NOT_FOUND',
      { ...context, resourceType, resourceId }
    );
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error thrown during rendering operations.
 */
export class RenderError extends AppError {
  /** The phase of rendering where the error occurred */
  public readonly phase: string | undefined;
  /** The layer ID that was being rendered, if applicable */
  public readonly layerId: string | undefined;

  constructor(
    message: string,
    phase?: string,
    layerId?: string,
    context: ErrorContext = {},
    cause?: Error
  ) {
    const extendedContext = { ...context };
    if (phase !== undefined) {
      extendedContext.phase = phase;
    }
    if (layerId !== undefined) {
      extendedContext.layerId = layerId;
    }
    super(
      message,
      'RENDER_ERROR',
      extendedContext,
      cause
    );
    this.name = 'RenderError';
    this.phase = phase;
    this.layerId = layerId;
  }
}

/**
 * Error thrown when asset loading fails.
 */
export class AssetLoadError extends AppError {
  /** The URL that failed to load */
  public readonly url: string;
  /** The type of asset */
  public readonly assetType: string;

  constructor(
    url: string,
    assetType: string,
    message?: string,
    context: ErrorContext = {},
    cause?: Error
  ) {
    super(
      message ?? `Failed to load ${assetType}: ${url}`,
      'ASSET_LOAD_ERROR',
      { ...context, url, assetType },
      cause
    );
    this.name = 'AssetLoadError';
    this.url = url;
    this.assetType = assetType;
  }
}

/**
 * Error thrown when worker communication fails.
 */
export class WorkerError extends AppError {
  /** The worker ID or type that failed */
  public readonly workerId: string | number | undefined;

  constructor(
    message: string,
    workerId?: string | number,
    context: ErrorContext = {},
    cause?: Error
  ) {
    const extendedContext = { ...context };
    if (workerId !== undefined) {
      extendedContext.workerId = workerId;
    }
    super(
      message,
      'WORKER_ERROR',
      extendedContext,
      cause
    );
    this.name = 'WorkerError';
    this.workerId = workerId;
  }
}

/**
 * Error thrown when a render operation is aborted.
 */
export class AbortError extends AppError {
  constructor(
    message = 'Operation aborted',
    context: ErrorContext = {}
  ) {
    super(message, 'ABORT_ERROR', context);
    this.name = 'AbortError';
  }
}

/**
 * Error thrown when browser capabilities are insufficient.
 */
export class CapabilityError extends AppError {
  /** The capability that is missing */
  public readonly capability: string;

  constructor(
    capability: string,
    message?: string,
    context: ErrorContext = {}
  ) {
    super(
      message ?? `Required capability not available: ${capability}`,
      'CAPABILITY_ERROR',
      { ...context, capability }
    );
    this.name = 'CapabilityError';
    this.capability = capability;
  }
}

/**
 * Type guard to check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if an error is a ValidationError.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if an error is a NotFoundError.
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * Type guard to check if an error is a RenderError.
 */
export function isRenderError(error: unknown): error is RenderError {
  return error instanceof RenderError;
}

/**
 * Type guard to check if an error is an AssetLoadError.
 */
export function isAssetLoadError(error: unknown): error is AssetLoadError {
  return error instanceof AssetLoadError;
}

/**
 * Type guard to check if an error is a WorkerError.
 */
export function isWorkerError(error: unknown): error is WorkerError {
  return error instanceof WorkerError;
}

/**
 * Type guard to check if an error is an AbortError.
 */
export function isAbortError(error: unknown): error is AbortError {
  return error instanceof AbortError;
}

/**
 * Type guard to check if an error is a CapabilityError.
 */
export function isCapabilityError(error: unknown): error is CapabilityError {
  return error instanceof CapabilityError;
}

/**
 * Wrap an unknown error in an AppError.
 * If already an AppError, returns as-is.
 */
export function wrapError(error: unknown, code = 'UNKNOWN_ERROR'): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, code, {}, error);
  }

  return new AppError(String(error), code);
}
