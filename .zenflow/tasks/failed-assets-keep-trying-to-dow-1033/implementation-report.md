# Implementation Report: Failed Assets Keep Trying to Download

**Date**: 02/17/26
**Task**: Failed assets keep trying to download
**Status**: Implemented and verified

---

## Summary

Fixed the bug where failed assets (404 responses) were being re-requested on every render. The fix tracks failed URLs in a Set and prevents them from being included in subsequent asset requests.

---

## Changes Made

### File: `src/js/renderer/index.ts`

#### 1. Added `failedUrls` Set Property (line 187)

```typescript
/** URLs that have failed to load (404 or other errors) */
private failedUrls: Set<string> = new Set();
```

This Set stores URLs that have failed to load, enabling quick lookup to prevent re-requesting.

#### 2. Updated `getAssetId()` Method (lines 625-640)

```typescript
private getAssetId(url: string): number {
  // Return -1 for known failed URLs to prevent re-requesting
  if (this.failedUrls.has(url)) {
    return -1;
  }

  const existing = this.assetMapping.urlToId.get(url);
  if (existing !== undefined) {
    return existing;
  }

  const id = this.assetMapping.nextId++;
  this.assetMapping.urlToId.set(url, id);
  this.assetMapping.idToUrl.set(id, url);
  return id;
}
```

The method now checks the `failedUrls` Set first and returns -1 for known-failed URLs, signaling they should not be requested.

#### 3. Updated `extractAssetRequests()` Method (lines 671-688)

```typescript
const addImageRequest = (url: string | undefined): void => {
  // Skip known failed URLs to prevent re-requesting
  if (url && !seen.has(url) && !this.failedUrls.has(url)) {
    seen.add(url);
    requests.push({
      id: this.getAssetId(url),
      url,
      assetType: 'image',
    });
  }
};
```

Added a check for `this.failedUrls.has(url)` to skip failed URLs when building asset requests.

#### 4. Updated `render()` Method to Mark Failed URLs (lines 1041-1050)

```typescript
if (failedAssets.length > 0) {
  const failedUrlsList = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
  console.warn('Some assets failed to load:', failedUrlsList);

  // Mark these URLs as failed so they won't be re-requested on subsequent renders
  for (const id of failedAssets) {
    const url = this.assetMapping.idToUrl.get(id);
    if (url) {
      this.failedUrls.add(url);
    }
  }
}
```

After `fetchAssets()` returns failed IDs, the URLs are now marked in the `failedUrls` Set.

#### 5. Updated `destroy()` Method (line 1410)

```typescript
// Clear asset mapping and failed URLs
this.assetMapping.urlToId.clear();
this.assetMapping.idToUrl.clear();
this.failedUrls.clear();
```

Added clearing of `failedUrls` to ensure clean state on RenderMaster destruction.

---

## Tests Added

### File: `src/js/renderer/index.test.ts`

Added a new describe block "failed asset URL tracking" with the following test cases:

1. **failedUrls Set tracking**
   - `should track failed URLs in a Set`
   - `should not duplicate failed URLs`
   - `should clear failed URLs on reset`

2. **getAssetId with failed URL tracking**
   - `should return -1 for known failed URLs`
   - `should continue to assign new IDs for non-failed URLs`

3. **extractAssetRequests with failed URL filtering**
   - `should skip failed URLs when extracting asset requests`
   - `should not request already-failed URLs on subsequent renders`

4. **failed asset processing in render flow**
   - `should mark URLs as failed after fetchAssets returns failed IDs`
   - `should warn once per failed asset`

---

## Verification Results

### Tests
- All new tests pass
- All existing tests pass (no regressions)
- TypeScript type check passes with no errors

### Test Output Summary
```
 ✓ failed asset URL tracking > failedUrls Set tracking > should track failed URLs in a Set
 ✓ failed asset URL tracking > failedUrls Set tracking > should not duplicate failed URLs
 ✓ failed asset URL tracking > failedUrls Set tracking > should clear failed URLs on reset
 ✓ failed asset URL tracking > getAssetId with failed URL tracking > should return -1 for known failed URLs
 ✓ failed asset URL tracking > getAssetId with failed URL tracking > should continue to assign new IDs for non-failed URLs
 ✓ failed asset URL tracking > extractAssetRequests with failed URL filtering > should skip failed URLs when extracting asset requests
 ✓ failed asset URL tracking > extractAssetRequests with failed URL filtering > should not request already-failed URLs on subsequent renders
 ✓ failed asset URL tracking > failed asset processing in render flow > should mark URLs as failed after fetchAssets returns failed IDs
 ✓ failed asset URL tracking > failed asset processing in render flow > should warn once per failed asset
```

---

## Behavior After Fix

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| First render with 404 URLs | Assets requested, warning logged | Assets requested, warning logged, URLs marked failed |
| Subsequent renders | Same assets re-requested, warning logged again | Failed URLs skipped, no warning |
| RenderMaster destruction | Asset mappings cleared | Asset mappings AND failedUrls cleared |
| `getAssetId()` for failed URL | Returns existing positive ID | Returns -1 |

---

## Acceptance Criteria Status

- [x] Failed asset URLs are tracked in a `failedUrls` Set
- [x] `getAssetId()` returns -1 for known-failed URLs
- [x] `extractAssetRequests()` skips known-failed URLs
- [x] Failed URLs are marked after `fetchAssets()` returns
- [x] `destroy()` clears the `failedUrls` Set
- [x] Console warning "Some assets failed to load" appears only once per URL
- [x] Subsequent renders do not re-request failed assets
- [x] Unit tests verify failure tracking behavior
