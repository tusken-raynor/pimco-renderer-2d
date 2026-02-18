# Investigation Report: Failed Assets Keep Trying to Download

**Date**: 02/17/26
**Task**: Failed assets keep trying to download
**Status**: Root cause identified

---

## Summary

Failed assets (404 responses) are not being marked as unavailable in the RenderMaster's asset ID map. When the user presses render, the system re-requests the same failed assets repeatedly because there's no mechanism to track and skip previously failed URLs.

---

## Root Cause

The bug is located in `src/js/renderer/index.ts` in the `render()` method at lines 1031-1037.

**Current behavior (buggy):**

```typescript
// src/js/renderer/index.ts:1031-1037
const assetRequests = this.extractAssetRequests(layers);
const failedAssets = await this.fetchAssets(assetRequests);

if (failedAssets.length > 0) {
  const failedUrls = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
  console.warn('Some assets failed to load:', failedUrls);
  // BUG: Failed asset IDs are logged but NEVER stored or processed
}
```

**The problem:**
1. `fetchAssets()` returns an array of failed asset IDs
2. The code logs them to console but takes **no action** to prevent retry
3. The `assetMapping` still contains positive IDs for failed URLs
4. On the next render, `extractAssetRequests()` calls `getAssetId()` for the same URLs
5. `getAssetId()` returns the same positive ID (line 623-625)
6. The same failed assets are requested again from the AssetManager
7. This creates an infinite retry loop

---

## Affected Code Flow

### 1. Asset ID Generation (`getAssetId` at line 622-632)

```typescript
private getAssetId(url: string): number {
  const existing = this.assetMapping.urlToId.get(url);
  if (existing !== undefined) {
    return existing;  // Returns cached ID even if it previously failed
  }

  const id = this.assetMapping.nextId++;
  this.assetMapping.urlToId.set(url, id);
  this.assetMapping.idToUrl.set(id, url);
  return id;
}
```

Once a URL gets a positive ID, it stays in the mapping forever, even after failure.

### 2. Asset Request Extraction (`extractAssetRequests` at line 662-695)

```typescript
private extractAssetRequests(layers: ProductImageComponent[]): AssetRequest[] {
  const requests: AssetRequest[] = [];
  const seen = new Set<string>();

  const addImageRequest = (url: string | undefined): void => {
    if (url && !seen.has(url)) {
      seen.add(url);
      requests.push({
        id: this.getAssetId(url),  // Gets same positive ID for failed URLs
        url,
        assetType: 'image',
      });
    }
  };
  // ... processes all layer URLs
}
```

No check for previously failed URLs - all are added to requests.

### 3. AssetManager Fetch (`src/js/asset-manager/index.ts:158-204`)

The AssetManager correctly:
- Catches failed loads (404s)
- Returns failed IDs in `fetch-complete` message
- But has no ability to mark URLs as permanently failed on the master side

---

## Impact

| Issue | Effect |
|-------|--------|
| Repeated network requests | Wasted bandwidth fetching 404 URLs |
| Console spam | Warning messages on every render |
| Performance degradation | Each render waits for failed fetches to timeout |
| User confusion | Assets that will never load keep being requested |

---

## Fix Plan

### Approach: Track Failed URLs in RenderMaster

Add a `failedUrls` Set to the RenderMaster and update `getAssetId()` to return -1 for known-failed URLs.

### Changes Required

#### 1. Add Failed URL Tracking (src/js/renderer/index.ts)

Add a new property to track failed URLs:

```typescript
// In class properties (around line 184)
private assetMapping: AssetMapping;
private failedUrls: Set<string> = new Set();  // NEW: Track failed URLs
```

#### 2. Update `getAssetId()` to Check Failed URLs

Modify the method to return -1 for failed URLs:

```typescript
private getAssetId(url: string): number {
  // NEW: Return -1 for known failed URLs
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

#### 3. Process Failed Assets in `render()` Method

After fetching assets, mark failed URLs:

```typescript
// src/js/renderer/index.ts, around line 1034-1037
if (failedAssets.length > 0) {
  const failedUrls = failedAssets.map((id) => this.assetMapping.idToUrl.get(id) ?? String(id));
  console.warn('Some assets failed to load:', failedUrls);

  // NEW: Mark these URLs as failed so they won't be re-requested
  for (const id of failedAssets) {
    const url = this.assetMapping.idToUrl.get(id);
    if (url) {
      this.failedUrls.add(url);
    }
  }
}
```

#### 4. Filter Out Failed Assets from Requests

Update `extractAssetRequests()` to skip failed URLs:

```typescript
const addImageRequest = (url: string | undefined): void => {
  // NEW: Skip known failed URLs
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

#### 5. Clear Failed URLs on Reset (in `clearState()` method)

Ensure failed URLs are cleared when state is reset:

```typescript
// Around line 1384-1386
this.assetMapping.urlToId.clear();
this.assetMapping.idToUrl.clear();
this.failedUrls.clear();  // NEW: Clear failed URLs on reset
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/js/renderer/index.ts` | Add `failedUrls` Set, update `getAssetId()`, process failures in `render()`, update `extractAssetRequests()`, clear in `clearState()` |

### Test Strategy

1. **Unit test**: Mock asset manager to return failed asset IDs, verify they're only requested once
2. **Integration test**: Render with 404 image URLs, verify no retry on subsequent renders
3. **Manual test**: Reproduce original scenario with pimco stack, verify console warning only appears once per failed asset

---

## Alternative Approaches Considered

### Alternative 1: Use ID -1 directly in assetMapping

Store -1 as the ID for failed URLs in `urlToId` map.

**Pros**: No new data structure needed
**Cons**: -1 could conflict with other sentinel values, less explicit

### Alternative 2: Retry with exponential backoff

Retry failed assets with increasing delays.

**Pros**: Handles temporary network issues
**Cons**: Doesn't match user expectation (they know 404s are permanent)

### Alternative 3: Remove failed URLs from assetMapping entirely

Delete the URL-to-ID mapping when failure occurs.

**Pros**: Simpler logic
**Cons**: Would cause ID regeneration on retry, potentially breaking references

**Chosen approach**: Separate `failedUrls` Set is the cleanest solution - explicit tracking, no side effects on existing mappings, easy to reason about.

---

## Acceptance Criteria for Fix

- [ ] Failed asset URLs are tracked in a `failedUrls` Set
- [ ] `getAssetId()` returns -1 for known-failed URLs
- [ ] `extractAssetRequests()` skips known-failed URLs
- [ ] Failed URLs are marked after `fetchAssets()` returns
- [ ] `clearState()` clears the `failedUrls` Set
- [ ] Console warning "Some assets failed to load" appears only once per URL
- [ ] Subsequent renders do not re-request failed assets
- [ ] Unit tests verify failure tracking behavior
