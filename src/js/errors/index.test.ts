import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  RenderError,
  AssetLoadError,
  WorkerError,
  AbortError,
  CapabilityError,
  isAppError,
  isValidationError,
  isNotFoundError,
  isRenderError,
  isAssetLoadError,
  isWorkerError,
  isAbortError,
  isCapabilityError,
  wrapError,
} from './index';

describe('AppError', () => {
  it('should create an error with message', () => {
    const error = new AppError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('APP_ERROR');
  });

  it('should create an error with custom code', () => {
    const error = new AppError('Test error', 'CUSTOM_CODE');
    expect(error.code).toBe('CUSTOM_CODE');
  });

  it('should create an error with context', () => {
    const error = new AppError('Test error', 'TEST', { layerId: '123' });
    expect(error.context).toEqual({ layerId: '123' });
  });

  it('should create an error with cause', () => {
    const cause = new Error('Original error');
    const error = new AppError('Wrapped error', 'TEST', {}, cause);
    expect(error.cause).toBe(cause);
  });

  it('should have a timestamp', () => {
    const before = new Date();
    const error = new AppError('Test error');
    const after = new Date();
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should be instanceof Error', () => {
    const error = new AppError('Test error');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof AppError).toBe(true);
  });

  it('should serialize to JSON', () => {
    const error = new AppError('Test error', 'TEST_CODE', { extra: 'data' });
    const json = error.toJSON();
    expect(json.name).toBe('AppError');
    expect(json.message).toBe('Test error');
    expect(json.code).toBe('TEST_CODE');
    expect(json.context).toEqual({ extra: 'data' });
    expect(json.timestamp).toBeDefined();
  });

  it('should convert to string with context', () => {
    const error = new AppError('Test error', 'TEST_CODE', { id: 123 });
    const str = error.toString();
    expect(str).toContain('[TEST_CODE]');
    expect(str).toContain('Test error');
    expect(str).toContain('id');
    expect(str).toContain('123');
  });

  it('should convert to string without context', () => {
    const error = new AppError('Test error', 'TEST_CODE');
    const str = error.toString();
    expect(str).toBe('[TEST_CODE] Test error');
  });
});

describe('ValidationError', () => {
  it('should create a validation error', () => {
    const error = new ValidationError('Invalid input');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
  });

  it('should include field name', () => {
    const error = new ValidationError('Invalid value', 'email');
    expect(error.field).toBe('email');
    expect(error.context.field).toBe('email');
  });

  it('should be instanceof AppError', () => {
    const error = new ValidationError('Invalid');
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof ValidationError).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('should create a not found error', () => {
    const error = new NotFoundError('Asset', 'asset-123');
    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Asset not found: asset-123');
  });

  it('should include resource info', () => {
    const error = new NotFoundError('Layer', 'layer-456');
    expect(error.resourceType).toBe('Layer');
    expect(error.resourceId).toBe('layer-456');
    expect(error.context.resourceType).toBe('Layer');
    expect(error.context.resourceId).toBe('layer-456');
  });
});

describe('RenderError', () => {
  it('should create a render error', () => {
    const error = new RenderError('Render failed');
    expect(error.name).toBe('RenderError');
    expect(error.code).toBe('RENDER_ERROR');
  });

  it('should include phase and layer ID', () => {
    const error = new RenderError('Failed', 'composition', 'layer-123');
    expect(error.phase).toBe('composition');
    expect(error.layerId).toBe('layer-123');
    expect(error.context.phase).toBe('composition');
    expect(error.context.layerId).toBe('layer-123');
  });

  it('should include cause', () => {
    const cause = new Error('WebGL error');
    const error = new RenderError('Shader failed', 'effects', 'layer-1', {}, cause);
    expect(error.cause).toBe(cause);
  });
});

describe('AssetLoadError', () => {
  it('should create an asset load error', () => {
    const error = new AssetLoadError('https://example.com/img.png', 'image');
    expect(error.name).toBe('AssetLoadError');
    expect(error.code).toBe('ASSET_LOAD_ERROR');
    expect(error.message).toBe('Failed to load image: https://example.com/img.png');
  });

  it('should include url and asset type', () => {
    const error = new AssetLoadError('https://example.com/font.woff', 'font');
    expect(error.url).toBe('https://example.com/font.woff');
    expect(error.assetType).toBe('font');
  });

  it('should allow custom message', () => {
    const error = new AssetLoadError('https://example.com', 'image', 'CORS error');
    expect(error.message).toBe('CORS error');
  });
});

describe('WorkerError', () => {
  it('should create a worker error', () => {
    const error = new WorkerError('Worker crashed');
    expect(error.name).toBe('WorkerError');
    expect(error.code).toBe('WORKER_ERROR');
  });

  it('should include worker ID as number', () => {
    const error = new WorkerError('Worker failed', 1);
    expect(error.workerId).toBe(1);
    expect(error.context.workerId).toBe(1);
  });

  it('should include worker ID as string', () => {
    const error = new WorkerError('Worker failed', 'asset-manager');
    expect(error.workerId).toBe('asset-manager');
  });
});

describe('AbortError', () => {
  it('should create an abort error with default message', () => {
    const error = new AbortError();
    expect(error.name).toBe('AbortError');
    expect(error.code).toBe('ABORT_ERROR');
    expect(error.message).toBe('Operation aborted');
  });

  it('should create an abort error with custom message', () => {
    const error = new AbortError('Render cancelled');
    expect(error.message).toBe('Render cancelled');
  });
});

describe('CapabilityError', () => {
  it('should create a capability error with default message', () => {
    const error = new CapabilityError('WebGL2');
    expect(error.name).toBe('CapabilityError');
    expect(error.code).toBe('CAPABILITY_ERROR');
    expect(error.message).toBe('Required capability not available: WebGL2');
    expect(error.capability).toBe('WebGL2');
  });

  it('should create a capability error with custom message', () => {
    const error = new CapabilityError('OffscreenCanvas', 'Fallback mode required');
    expect(error.message).toBe('Fallback mode required');
    expect(error.capability).toBe('OffscreenCanvas');
  });
});

describe('Type Guards', () => {
  it('isAppError should identify AppError', () => {
    expect(isAppError(new AppError('test'))).toBe(true);
    expect(isAppError(new ValidationError('test'))).toBe(true);
    expect(isAppError(new Error('test'))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError('error')).toBe(false);
  });

  it('isValidationError should identify ValidationError', () => {
    expect(isValidationError(new ValidationError('test'))).toBe(true);
    expect(isValidationError(new AppError('test'))).toBe(false);
    expect(isValidationError(new Error('test'))).toBe(false);
  });

  it('isNotFoundError should identify NotFoundError', () => {
    expect(isNotFoundError(new NotFoundError('Asset', 'id'))).toBe(true);
    expect(isNotFoundError(new AppError('test'))).toBe(false);
  });

  it('isRenderError should identify RenderError', () => {
    expect(isRenderError(new RenderError('test'))).toBe(true);
    expect(isRenderError(new AppError('test'))).toBe(false);
  });

  it('isAssetLoadError should identify AssetLoadError', () => {
    expect(isAssetLoadError(new AssetLoadError('url', 'image'))).toBe(true);
    expect(isAssetLoadError(new AppError('test'))).toBe(false);
  });

  it('isWorkerError should identify WorkerError', () => {
    expect(isWorkerError(new WorkerError('test'))).toBe(true);
    expect(isWorkerError(new AppError('test'))).toBe(false);
  });

  it('isAbortError should identify AbortError', () => {
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isAbortError(new AppError('test'))).toBe(false);
  });

  it('isCapabilityError should identify CapabilityError', () => {
    expect(isCapabilityError(new CapabilityError('test'))).toBe(true);
    expect(isCapabilityError(new AppError('test'))).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return AppError as-is', () => {
    const original = new AppError('test');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should return ValidationError as-is', () => {
    const original = new ValidationError('test');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap Error in AppError', () => {
    const original = new Error('test error');
    const wrapped = wrapError(original);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe('test error');
    expect(wrapped.cause).toBe(original);
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
  });

  it('should wrap Error with custom code', () => {
    const original = new Error('test');
    const wrapped = wrapError(original, 'CUSTOM_CODE');
    expect(wrapped.code).toBe('CUSTOM_CODE');
  });

  it('should wrap string in AppError', () => {
    const wrapped = wrapError('string error');
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe('string error');
  });

  it('should wrap null in AppError', () => {
    const wrapped = wrapError(null);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe('null');
  });

  it('should wrap undefined in AppError', () => {
    const wrapped = wrapError(undefined);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe('undefined');
  });

  it('should wrap number in AppError', () => {
    const wrapped = wrapError(42);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe('42');
  });
});
