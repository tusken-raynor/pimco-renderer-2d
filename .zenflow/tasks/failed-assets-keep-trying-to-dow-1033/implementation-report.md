# Implementation Report: Failed Assets Keep Trying to Download

**Date**: 02/17/26
**Task**: Failed assets keep trying to download
**Status**: Implemented and verified

---

## Summary

Fixed the bug where failed assets (404 responses) were being re-requested on every render. The fix uses the existing `urlToId` map to track failed URLs by setting their ID to -1, which is the intended sentinel value for unavailable assets.

---

## Changes Made

### File: `src/js/renderer/index.ts`

#### 1. Updated `render()` Method to Mark Failed URLs (lines 1034-1044)

```typescript
if (failedAssets.length > 0) {
  const failedUrlsList = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
  console.warn('Some assets failed to load:', failedUrlsList);

  // Mark these URLs as failed by setting their ID to -1 in urlToId map
  // This prevents re-requesting on subsequent renders
  for (const id of failedAssets) {
    const url = this.assetMapping.idToUrl.get(id);
    if (url) {
      this.assetMapping.urlToId.set(url, -1);
    }
  }
}
```

After `fetchAssets()` returns failed IDs, the URLs are marked as failed by setting their ID to -1 in the `urlToId` map.

#### 2. Updated `extractAssetRequests()` Method (lines 663-676)

```typescript
const addImageRequest = (url: string | undefined): void => {
  if (url && !seen.has(url)) {
    const id = this.getAssetId(url);
    // Skip known failed URLs (ID of -1) to prevent re-requesting
    if (id !== -1) {
      seen.add(url);
      requests.push({
        id,
        url,
        assetType: 'image',
      });
    }
  }
};
```

Now checks if `getAssetId()` returns -1 and skips those URLs.

#### 3. `getAssetId()` Method (unchanged logic, updated comment)

The method already returns the cached value from `urlToId`, which now includes -1 for failed URLs.

```typescript
private getAssetId(url: string): number {
  const existing = this.assetMapping.urlToId.get(url);
  if (existing !== undefined) {
    return existing; // Returns -1 for failed URLs, positive ID for successful ones
  }
  // ...
}
```

---

## Design Decision

The investigation report considered using a separate `failedUrls` Set, but the simpler and more correct approach is to use the existing `urlToId` map with -1 as the sentinel value:

| Approach | Pros | Cons |
|----------|------|------|
| Separate `failedUrls` Set | Explicit tracking | Redundant data structure, extra memory |
| **`urlToId` map with -1** | No new data structure, -1 is already the intended sentinel | None |

The `urlToId` map is already the canonical source for URL-to-ID mapping, and -1 is the documented sentinel value for "unavailable" assets. Using this existing mechanism is simpler and more consistent.

---

## Tests Added

### File: `src/js/renderer/index.test.ts`

Added a new describe block "failed asset URL tracking" with the following test cases:

1. **urlToId map with -1 for failed URLs**
   - `should track failed URLs by setting ID to -1 in urlToId map`
   - `should overwrite positive ID with -1 when asset fails`
   - `should clear failed URLs when map is cleared`

2. **getAssetId returning -1 for failed URLs**
   - `should return -1 for URLs marked as failed in urlToId`
   - `should continue to assign new IDs for non-failed URLs`

3. **extractAssetRequests skipping failed URLs**
   - `should skip URLs with ID -1 when extracting asset requests`
   - `should not request already-failed URLs on subsequent renders`

4. **failed asset processing in render flow**
   - `should mark URLs as failed by setting ID to -1 after fetchAssets returns`
   - `should warn once per failed asset`

---

## Verification Results

### Tests
- All 55 tests pass in `index.test.ts`
- All existing tests pass (no regressions)
- TypeScript type check passes with no errors

---

## Behavior After Fix

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| First render with 404 URLs | Assets requested, warning logged | Assets requested, warning logged, URL ID set to -1 |
| Subsequent renders | Same assets re-requested, warning logged again | Failed URLs skipped (ID is -1), no warning |
| `getAssetId()` for failed URL | Returns existing positive ID | Returns -1 |
| RenderMaster destruction | Asset mappings cleared | Asset mappings cleared (includes -1 entries) |

---

## Acceptance Criteria Status

- [x] Failed asset URLs are tracked (via -1 in `urlToId` map)
- [x] `getAssetId()` returns -1 for known-failed URLs
- [x] `extractAssetRequests()` skips URLs with ID -1
- [x] Failed URLs are marked after `fetchAssets()` returns
- [x] Console warning "Some assets failed to load" appears only once per URL
- [x] Subsequent renders do not re-request failed assets
- [x] Unit tests verify failure tracking behavior
