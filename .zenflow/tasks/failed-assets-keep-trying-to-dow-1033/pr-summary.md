# Pull Request Summary

**Date**: 02/17/26
**Task**: Failed assets keep trying to download
**Status**: PR Created

---

## Pull Request Details

| Field | Value |
|-------|-------|
| **PR Number** | #3 |
| **Title** | Bug Fix: Failed assets keep trying to download |
| **URL** | https://github.com/tusken-raynor/pimco-renderer-2d/pull/3 |
| **State** | Open |
| **Head Branch** | `failed-assets-keep-trying-to-dow-1033` |
| **Base Branch** | `main` |
| **Created** | 2026-02-18T02:13:23Z |

---

## PR Description

### Summary

Fixed a bug where failed assets (404 responses) were being re-requested on every render instead of being marked as unavailable.

### What was the bug?
When rendering a stack of pimcos, images that fail to load (404 errors) were being requested repeatedly on each subsequent render, causing:
- Wasted network bandwidth
- Console warning spam
- Performance degradation
- User confusion

### Root cause
In `src/js/renderer/index.ts`, the `render()` method logged failed asset IDs but **never stored them** to prevent retry. The `assetMapping` continued to return positive IDs for failed URLs, causing them to be re-requested on every render.

### How it was fixed
Added a `failedUrls` Set to track URLs that have failed to load:

1. **Added `failedUrls` Set property** - Stores URLs that have failed to load
2. **Updated `getAssetId()`** - Returns -1 for known-failed URLs
3. **Updated `extractAssetRequests()`** - Skips failed URLs when building requests
4. **Updated `render()`** - Marks URLs as failed after `fetchAssets()` returns failed IDs
5. **Updated `destroy()`** - Clears the `failedUrls` Set on destruction

### Tests added
- `should track failed URLs in a Set`
- `should not duplicate failed URLs`
- `should clear failed URLs on reset`
- `should return -1 for known failed URLs`
- `should skip failed URLs when extracting asset requests`
- `should not request already-failed URLs on subsequent renders`
- `should mark URLs as failed after fetchAssets returns failed IDs`
- `should warn once per failed asset`

---

## Notification Status

**Status**: Skipped

**Reason**: `ZENFLOW_PROJECT_TOPIC` environment variable not found in .env file.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/js/renderer/index.ts` | Added `failedUrls` Set, updated `getAssetId()`, `extractAssetRequests()`, `render()`, and `destroy()` methods |
| `src/js/renderer/index.test.ts` | Added 9 new test cases for failed URL tracking |

---

## Next Steps

1. Review the PR at https://github.com/tusken-raynor/pimco-renderer-2d/pull/3
2. Request reviews if needed
3. Merge once approved
