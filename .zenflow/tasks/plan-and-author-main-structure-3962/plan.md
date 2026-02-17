# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: a4b8d733-0de5-43a2-9809-c3fd326ef085 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 61cf61f9-dae7-4777-b946-13a3623c3719 -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: b63183ee-88d0-4189-9a6e-f84afe8b834f -->

Create a detailed implementation plan based on `{@artifacts_path}/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint). Avoid steps that are too granular (single function) or too broad (entire feature).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `{@artifacts_path}/plan.md`.

---

# Implementation Plan

## Phase 1: Foundation & Dev App

### [x] Step: Project Setup and Tooling Configuration
<!-- chat-id: a96027c5-556b-49f0-bee1-9d3efbe7c768 -->

Set up the project infrastructure with Vite, TypeScript strict mode, ESLint, Prettier, and Vitest.

**Tasks:**
- [x] Initialize package.json with project metadata
- [x] Install and configure Vite with TypeScript support
- [x] Configure tsconfig.json with strict mode settings per spec
- [x] Set up ESLint with TypeScript rules (no `any`, 2-space indent, single quotes, semicolons)
- [x] Configure Prettier (.prettierrc with 2-space, single quotes, trailing commas, 100 char width)
- [x] Set up Vitest and Playwright
- [x] Add all npm scripts per requirements (test, lint, format, type-check, validate)
- [x] Verify .gitignore includes all necessary patterns (already present)

**Verification:**
- `npm run lint` passes with no errors
- `npm run type-check` passes
- `npm run test` runs (may have no tests yet)

**Reference Files:**
- `requirements.md`: Required Tooling Setup section
- `spec.md`: Lint & Type Check Commands section

---

### [x] Step: Type Definitions and Error Infrastructure
<!-- chat-id: e39c7b4e-4eaf-497c-bd67-58d5fe9490de -->

Create the shared type definitions and error handling infrastructure.

**Tasks:**
- [x] Create `src/js/types/index.ts` - export barrel
- [x] Create `src/js/types/pimco.ts` - ProductImageComponent, PimcoMaskSubstitutionCompiled, BlendMode, etc.
  - Add `compositealpha?: number` to ProductImageComponent
  - Add `"shadow"` to PimcoMaskSubstitutionEffect union
- [x] Create `src/js/types/messages.ts` - All worker message types (InitMessage, BatchMessage, AbortMessage, ReadyMessage, CapabilitiesMessage, ResultMessage, ErrorMessage, RenderSegment, etc.)
- [x] Create `src/js/types/docs.md` - Document all types
- [x] Create `src/js/errors/index.ts` - AppError, ValidationError, NotFoundError, RenderError classes
- [x] Create `src/js/errors/index.test.ts` - Unit tests for error classes
- [x] Create `src/js/errors/docs.md` - Document error handling patterns

**Verification:**
- `npm run type-check` passes
- Unit tests for error classes pass
- Types correctly imported in other modules

**Reference Files:**
- `old-src-ref/src/types.ts`: Lines 1-1926 (type definitions)
- `spec.md`: Data Model / API / Interface Changes section

---

### [x] Step: Utility Functions
<!-- chat-id: f91c36fb-8793-47e9-8e28-d2a8a9a4c1a6 -->

Create shared utility functions for canvas operations and color manipulation.

**Tasks:**
- [x] Create `src/js/utils/index.ts` - export barrel
- [x] Create `src/js/utils/color.ts` - Color parsing, manipulation, brightness calculation
  - Reference legacy `effects/index.ts` for color patterns
- [x] Create `src/js/utils/canvas.ts` - Canvas context helpers, reset functions
  - Reference legacy `canvas-workers.ts` for reset patterns
- [x] Create `src/js/utils/index.test.ts` - Unit tests for all utilities
- [x] Create `src/js/utils/docs.md` - Document utilities

**Verification:**
- All utility functions have unit tests
- `npm run test:unit` passes

**Reference Files:**
- `old-src-ref/src/renderer/canvas-workers.ts`: resetCanvasContext() function
- `old-src-ref/src/effects/index.ts`: Color manipulation utilities

---

### [x] Step: Capability Detection Module
<!-- chat-id: 4de78900-9b70-404c-b04c-513f502bee6a -->

Create browser capability detection for OffscreenCanvas and WebGL2.

**Tasks:**
- [x] Create `src/js/renderer/capability-probe.ts`
  - Detect OffscreenCanvas support
  - Detect WebGL2 support
  - Determine fallback scenario (A-F) based on capabilities
  - Return typed CapabilityResult object
- [x] Create unit tests with mocked browser APIs
- [x] Update `src/js/renderer/docs.md` (or create if first renderer file)

**Verification:**
- Unit tests cover all 6 scenarios
- `npm run test:unit` passes

**Reference Files:**
- `requirements.md`: Fallback Scenarios table
- `spec.md`: Architecture Overview

---

### [x] Step: Dev App Foundation
<!-- chat-id: 1ef0904b-986d-4b92-aa5f-54cd097a6765 -->

Create the vanilla HTML/CSS/TypeScript dev app for testing the renderer.

**Tasks:**
- [x] Create `src/dev-app/index.html` - Basic HTML structure with canvas and file input
- [x] Create `src/dev-app/styles.css` - Minimal BEM-named styles
- [x] Create `src/dev-app/main.ts` - App entry point
  - File input handler for JSON upload
  - Canvas display for rendered output
  - Render button and timing display
  - Console logging for debug output
  - Error display for failed renders
- [x] Configure Vite to serve dev-app as entry point
- [x] Example JSON files already in `public/` folder (served automatically by Vite)

**Verification:**
- `npm run dev` starts dev server
- Can upload JSON file and see it parsed
- Canvas element displays correctly

**Reference Files:**
- `requirements.md`: Dev App Requirements section
- `public/example1.json`, `example2.json`, `example3.json`: Test data (served from public folder)

---

### [x] Step: Asset Manager Worker
<!-- chat-id: 69e795fe-d302-45e6-b7db-f0658ff35dbd -->

Implement the Asset Manager worker for centralized asset loading.

**Tasks:**
- [x] Create `src/js/asset-manager/index.ts` - AssetManager class
  - Image loading via fetch + createImageBitmap
  - URL-to-ID cache management
  - Asset distribution to slaves via MessagePort
  - Handle fetch, distribute, preload, register-slave messages
- [x] Create `src/js/asset-manager/image-loader.ts` - Image loading helpers
- [x] Create `src/workers/asset-manager.worker.ts` - Worker entry point
- [x] Create `src/js/asset-manager/index.test.ts` - Unit tests
- [x] Create `src/js/asset-manager/docs.md` - Documentation

**Verification:**
- Unit tests for image loading logic
- Worker can be instantiated
- Message protocol compliance

**Reference Files:**
- `spec.md`: Master ↔ Asset Manager Messages
- `old-src-ref/src/renderer/index.ts`: loadImage(), loadImages() functions (lines 223-280)

---

## Phase 2: Standard Render Slave

### [x] Step: Layer Classification Module
<!-- chat-id: 045f319a-856d-47f7-b8f6-ae612fb65c18 -->

Implement layer classification logic (standard vs text layers).

**Tasks:**
- [x] Create `src/js/renderer/layer-classifier.ts`
  - Classify layers based on `mask` field type
  - String URL → standard layer
  - Object (PimcoMaskSubstitutionCompiled) → text layer
  - Return typed classification result
- [x] Create unit tests for classification logic
- [x] Update renderer docs.md

**Verification:**
- All classification cases tested
- Edge cases (missing mask, null values) handled

**Reference Files:**
- `spec.md`: Layer Classification section
- `old-src-ref/src/renderer/index.ts`: drawSubstitution() routing logic

---

### [x] Step: Intra-Layer Pipeline
<!-- chat-id: 3227aaa9-ad65-44ed-bbda-82a168837be1 -->

Implement the 5-step intra-layer rendering pipeline for standard layers.

**Tasks:**
- [x] Create `src/js/render-slave/intra-layer-pipeline.ts`
  - Step 1: Draw base image with placement transforms
  - Step 2: Apply color/texture with blend mode and alpha
  - Step 3: Apply highlight 1 (if defined)
  - Step 4: Apply highlight 2 (if defined)
  - Step 5: Apply mask (destination-in composite)
- [x] Create `src/js/render-slave/index.ts` - RenderSlave class
- [x] Create unit tests for each pipeline step
- [x] Create `src/js/render-slave/docs.md`

**Verification:**
- Each pipeline step tested independently
- Combined pipeline produces correct output
- `npm run test:unit` passes

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: drawPimcoStack() function (lines 120-221)
- `requirements.md`: Standard Render Slaves section

---

### [x] Step: Batch Segmentation
<!-- chat-id: 283353cc-dc1b-4262-a15f-a975a8646abf -->

Implement batch segmentation logic for optimized composition.

**Tasks:**
- [x] Create `src/js/render-slave/batch-segmenter.ts`
  - Group consecutive combinable modes (source-over, screen, lighten, lighter)
  - Produce standalone segments for non-combinable modes
  - Return typed RenderSegment arrays
- [x] Add unit tests for segmentation logic
- [x] Update render-slave docs.md

**Verification:**
- Combinable modes correctly grouped
- Non-combinable modes produce standalone segments
- All composite modes tested

**Reference Files:**
- `spec.md`: Combinable Composite Modes section

---

### [x] Step: Standard Render Slave Worker
<!-- chat-id: 9b4b21b5-8c0b-4e1e-b3ed-1bd3e7bce7a0 -->

Create the worker entry point for Standard Render Slave.

**Tasks:**
- [x] Create `src/workers/render-slave.worker.ts`
  - Message handler for init, batch, abort
  - Capability probe on init
  - Asset reception handling
  - Layer rendering using intra-layer pipeline
  - Result segmentation and transfer
- [x] Add integration with Asset Manager for asset delivery
- [x] Update render-slave docs.md

**Verification:**
- Worker starts and responds to messages
- Capability probe returns correct values
- Abort handling works correctly

**Reference Files:**
- `spec.md`: Master ↔ Slave Messages

---

### [x] Step: RenderMaster Core Implementation
<!-- chat-id: a37103c6-bdfe-441c-a113-f09990835451 -->

Implement the RenderMaster orchestration class.

**Tasks:**
- [ ] Create `src/js/renderer/index.ts` - RenderMaster class
  - Spawn and manage workers (Asset Manager, Standard Slaves)
  - Capability detection on initialization
  - URL-to-numeric-ID asset mapping
  - Layer classification and distribution
  - Abort-on-reentry logic
  - `render()`, `preload()`, `destroy()` public API
- [ ] Create `src/js/renderer/master-compositor.ts`
  - Final composition of slave results
  - Canvas/OffscreenCanvas composition
  - Apply compositealpha per segment
- [ ] Create `src/js/renderer/index.test.ts` - Unit tests
- [ ] Update `src/js/renderer/docs.md`

**Verification:**
- RenderMaster can render standard-only layers
- example1.json renders correctly (if no text layers)
- Abort handling works
- `npm run test:unit` passes

**Reference Files:**
- `spec.md`: RenderMaster Public API
- `old-src-ref/src/renderer/index.ts`: draw() function orchestration

---

### [x] Step: Dev App Integration with Standard Rendering
<!-- chat-id: 69121fe0-b762-4e65-818d-320d3518fcba -->

Connect dev app to RenderMaster for standard layer rendering.

**Tasks:**
- [x] Update `src/dev-app/main.ts`
  - Instantiate RenderMaster
  - Pass uploaded JSON layers to render()
  - Display ImageBitmap result on canvas
  - Show render timing
  - Handle and display errors
- [x] Create integration test for standard rendering workflow
- [x] Update src/tests/integration/docs.md with test documentation

**Verification:**
- Dev app renders uploaded JSON
- Timing displayed correctly
- Errors shown for invalid JSON

**Reference Files:**
- `requirements.md`: Dev App Requirements

---

## Phase 3: Text Render Slave with Effects

### [x] Step: Font Loading in Asset Manager
<!-- chat-id: d63b2076-055f-4b51-bb79-d747e7cd100f -->

Add font loading capability to Asset Manager.

**Tasks:**
- [x] Create `src/js/asset-manager/font-loader.ts`
  - Fetch font as ArrayBuffer
  - Cache font data
  - Send font once per text slave
- [x] Update Asset Manager to handle font asset type
- [x] Add unit tests for font loading
- [x] Update asset-manager docs.md

**Verification:**
- Fonts load and cache correctly
- Font data transfers to workers

**Reference Files:**
- `requirements.md`: Asset Types table

---

### [x] Step: Text Rasterization Module
<!-- chat-id: 37b9a330-b4d4-4435-850d-df8700b9060c -->

Implement text rasterization with font metrics.

**Tasks:**
- [x] Create `src/js/text-render-slave/text-rasterizer.ts`
  - Text measurement with FontFace API
  - Canvas text rendering with proper metrics
  - Handle font properties (family, size, weight, style)
  - Support for multi-line text
- [x] Create `src/js/text-render-slave/index.ts` - TextRenderSlave class
- [x] Create unit tests for text rasterization
- [x] Create `src/js/text-render-slave/docs.md`

**Verification:**
- Text renders with correct metrics
- Font properties applied correctly
- Multi-line text works

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: Text rendering in drawSubstitution()

---

### [x] Step: 2D Transform Application
<!-- chat-id: 09772ee8-2010-43ed-80fa-7b27273d0d78 -->

Implement 2D transform (translation, rotation, scale) for text layers.

**Tasks:**
- [x] Add transform application to text-render-slave
  - Translation, rotation, scale via DOMMatrix or canvas transforms
  - Support transform sequence (array of transforms)
- [x] Add post-mask application (destination-in after transforms)
- [x] Add unit tests for transforms
- [x] Update text-render-slave docs.md

**Verification:**
- All transform types work correctly
- Transform order preserved
- Post-mask applied correctly

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: applyWithTransformation() (lines 1343-1399), applyTransformSequence() (lines 1956-2025)

---

### [x] Step: WebGL PostProcessor Integration and Shaders
<!-- chat-id: 6a5d79ac-bc75-4b58-a9ce-544f68932ccf -->

Set up WebGL postprocessor integration and create internal shader files.

**Tasks:**
- [x] Create `src/shaders/passthrough.vert.glsl` - Default vertex shader
- [x] Create `src/shaders/alpha-erode.frag.glsl` - Alpha erosion shader
- [x] Create `src/shaders/emboss.frag.glsl` - Emboss/deboss convolution shader
- [x] Create `src/shaders/fuzz.frag.glsl` - Fuzz/blur shader for embroidery
- [x] Create `src/shaders/normal-map.frag.glsl` - Normal map generation
- [x] Create `src/shaders/color-scale.frag.glsl` - Color scaling/tinting
- [x] Create `src/js/effects/index.ts` - Effects module entry point with webgl-postprocessor integration
- [x] Create `src/js/effects/docs.md` - Document effect architecture

**Verification:**
- Shaders compile without errors
- WebGLPostProcessor initializes correctly

**Reference Files:**
- `old-src-ref/src/effects/index.ts`: Effect implementations
- `spec.md`: WebGL Post-Processor section

---

### [x] Step: No-Effect and Shadow Effects
<!-- chat-id: f75f6fb4-23a8-41ca-9d09-d1960b519111 -->

Implement no-effect (basic) and shadow effect pipelines.

**Tasks:**
- [x] Create `src/js/effects/no-effect.ts`
  - Tile texture
  - Color multiply
  - Mask application
- [x] Create `src/js/effects/shadow.ts`
  - Spread
  - White-to-alpha
  - Color fill
  - Blur
  - Multi-pass alpha
- [x] Add unit tests for effect parameter handling
- [x] Update effects docs.md

**Verification:**
- No-effect produces correct output
- Shadow effect matches legacy output

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: noEffect() and shadowEffect() functions
- `requirements.md`: Supported Effects table

---

### [x] Step: Engraving and Hotstamp Effects
<!-- chat-id: 9b172df3-6514-4e57-ab9d-e06a6493b29a -->

Implement engraving and hotstamp effect pipelines.

**Tasks:**
- [ ] Create `src/js/effects/engraving.ts`
  - Emboss shadow
  - Color-distance opacity
  - Multiply
  - Mask
- [ ] Create `src/js/effects/hotstamp.ts`
  - Dual emboss
  - Color-distance opacity
  - Multiply
  - Mask
- [ ] Add unit tests
- [ ] Update effects docs.md

**Verification:**
- Effects match legacy output
- Parameters handled correctly

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: engravingEffect(), hotstampEffect()

---

### [x] Step: Embroidery and Metal Effects
<!-- chat-id: 9a8216cf-4b70-4439-8865-a7bfc330fabe -->

Implement embroidery and metal effect pipelines.

**Tasks:**
- [x] Create `src/js/effects/embroidery.ts`
  - Alpha erode
  - Tile texture
  - Color multiply
  - Emboss
  - Fuzz
  - Mask
  - Shadow
- [x] Create `src/js/effects/metal.ts`
  - Dual emboss
  - Tile texture
  - Color multiply
  - Mask
- [x] Add unit tests
- [x] Update effects docs.md

**Verification:**
- Effects match legacy output
- Fuzz effect works (embroidery)

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: embroideryEffect(), metalEffect()
- `old-src-ref/src/effects/index.ts`: fuzz() function

---

### [x] Step: Foil and Painted Effects
<!-- chat-id: dfdc8991-76bd-46e6-b0ce-7daae42f6aad -->

Implement foil and painted effect pipelines.

**Tasks:**
- [x] Create `src/js/effects/foil.ts`
  - Alpha erode
  - Tile texture
  - Color blend
  - Dual emboss
  - Shrink mask
  - Shadow
- [x] Create `src/js/effects/painted.ts`
  - Edge expand
  - Dual emboss
  - Inset shrink
  - Tile texture
  - Color blend
  - Mask
- [x] Add unit tests
- [x] Update effects docs.md

**Verification:**
- Effects match legacy output

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: foilEffect(), paintedEffect()

---

### [ ] Step: Normal Effect

Implement normal effect pipeline.

**Tasks:**
- [ ] Create `src/js/effects/normal.ts`
  - Roundness blur
  - Color scale
  - Normal map generation
  - Directional lighting
- [ ] Add unit tests
- [ ] Update effects docs.md

**Verification:**
- Normal map generation works
- Lighting applied correctly

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: normalEffect()
- `old-src-ref/src/effects/index.ts`: normalMap() function

---

### [ ] Step: Text Render Slave Worker

Create the worker entry point for Text Render Slave.

**Tasks:**
- [ ] Create `src/workers/text-render-slave.worker.ts`
  - Message handler for init, batch, abort
  - Capability probe (WebGL2 required for effects)
  - Font loading and application
  - Effect routing and application
  - Transform/post-mask pipeline
  - Result transfer
- [ ] Update text-render-slave docs.md

**Verification:**
- Worker handles all message types
- Effects route correctly
- Text layers render with effects

**Reference Files:**
- `spec.md`: Text Render Slaves section

---

### [ ] Step: RenderMaster Text Layer Routing

Integrate text layer routing into RenderMaster.

**Tasks:**
- [ ] Update `src/js/renderer/index.ts`
  - Spawn text slaves
  - Route text layers to text slaves
  - Handle text slave results in composition
- [ ] Create integration tests for text rendering
- [ ] Update integration test documentation

**Verification:**
- Text layers render correctly
- Mixed standard/text layers compose correctly

---

## Phase 4: Fallback & Polish

### [ ] Step: Virtual Slave Implementation

Create virtual slave class for main-thread fallback.

**Tasks:**
- [ ] Create `src/virtual-slaves.ts`
  - VirtualStandardSlave class with MessagePort interface
  - VirtualTextSlave class with MessagePort interface
  - Use HTMLCanvasElement instead of OffscreenCanvas
  - Same message protocol as real workers
- [ ] Add unit tests for virtual slaves
- [ ] Document virtual slave architecture

**Verification:**
- Virtual slaves respond to same messages as real workers
- Rendering produces same output

**Reference Files:**
- `requirements.md`: Virtual Slaves section

---

### [ ] Step: Fallback Scenarios A-F Implementation

Implement all six fallback scenarios.

**Tasks:**
- [ ] Update RenderMaster to handle all scenarios:
  - A: Main thread master, workers for both slave types
  - B: Main thread master, workers for standard, virtual for text
  - C: Main thread master, virtual for both
  - D: Worker master, workers for both
  - E: Worker master, workers for standard, virtual for text
  - F: Worker master, virtual for both, software compositor
- [ ] Create `src/js/renderer/software-compositor.ts` for Scenario F
  - ImageData-based composition without canvas
- [ ] Add integration tests for each scenario
- [ ] Update integration test documentation

**Verification:**
- All 6 scenarios work correctly
- Fallback detection automatic

**Reference Files:**
- `requirements.md`: Fallback Scenarios table
- `spec.md`: Delivery Phases - Phase 4

---

### [ ] Step: Memory Management and Performance Optimization

Audit memory usage and optimize performance.

**Tasks:**
- [ ] Audit ImageBitmap lifecycle and cleanup
- [ ] Implement proper worker termination in destroy()
- [ ] Add canvas/context cleanup
- [ ] Profile rendering performance
- [ ] Optimize hot paths (asset transfer, composition)
- [ ] Document performance characteristics in docs.md

**Verification:**
- No memory leaks in heap snapshots
- Performance improvement over single-threaded baseline

**Reference Files:**
- `old-src-ref/src/renderer/canvas-workers.ts`: Resource cleanup patterns

---

### [ ] Step: E2E Tests via Dev App

Create end-to-end tests using Playwright.

**Tasks:**
- [ ] Create `src/tests/e2e/dev-app-render.spec.ts`
  - Upload JSON → render → verify canvas has content
- [ ] Create `src/tests/e2e/dev-app-errors.spec.ts`
  - Invalid JSON handling
  - Missing asset handling
- [ ] Create `src/tests/e2e/dev-app-timing.spec.ts`
  - Render timing display verification
- [ ] Update `src/tests/e2e/docs.md` with test documentation

**Verification:**
- All E2E tests pass
- `npm run test:e2e` passes

---

### [ ] Step: Project Documentation

Create comprehensive project documentation.

**Tasks:**
- [ ] Create root `docs.md`
  - High-level architecture overview
  - Key modules and relationships
  - Technology stack
  - Getting started guide
- [ ] Review and update all module docs.md files
- [ ] Ensure all test documentation is complete

**Verification:**
- Documentation complete and accurate
- All modules documented

---

### [ ] Step: Final Validation and Cleanup

Run full validation suite and cleanup.

**Tasks:**
- [ ] Run `npm run validate` (format, lint, type-check, test)
- [ ] Fix any remaining issues
- [ ] Visual comparison with legacy renderer output
- [ ] Clean up any TODO comments or debug code
- [ ] Ensure all example JSON files render correctly

**Verification:**
- `npm run validate` passes
- All example JSON files render correctly
- Output matches legacy renderer
