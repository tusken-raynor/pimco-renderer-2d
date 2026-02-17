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

### [ ] Step: Utility Functions

Create shared utility functions for canvas operations and color manipulation.

**Tasks:**
- [ ] Create `src/js/utils/index.ts` - export barrel
- [ ] Create `src/js/utils/color.ts` - Color parsing, manipulation, brightness calculation
  - Reference legacy `effects/index.ts` for color patterns
- [ ] Create `src/js/utils/canvas.ts` - Canvas context helpers, reset functions
  - Reference legacy `canvas-workers.ts` for reset patterns
- [ ] Create `src/js/utils/index.test.ts` - Unit tests for all utilities
- [ ] Create `src/js/utils/docs.md` - Document utilities

**Verification:**
- All utility functions have unit tests
- `npm run test:unit` passes

**Reference Files:**
- `old-src-ref/src/renderer/canvas-workers.ts`: resetCanvasContext() function
- `old-src-ref/src/effects/index.ts`: Color manipulation utilities

---

### [ ] Step: Capability Detection Module

Create browser capability detection for OffscreenCanvas and WebGL2.

**Tasks:**
- [ ] Create `src/js/renderer/capability-probe.ts`
  - Detect OffscreenCanvas support
  - Detect WebGL2 support
  - Determine fallback scenario (A-F) based on capabilities
  - Return typed CapabilityResult object
- [ ] Create unit tests with mocked browser APIs
- [ ] Update `src/js/renderer/docs.md` (or create if first renderer file)

**Verification:**
- Unit tests cover all 6 scenarios
- `npm run test:unit` passes

**Reference Files:**
- `requirements.md`: Fallback Scenarios table
- `spec.md`: Architecture Overview

---

### [ ] Step: Dev App Foundation

Create the vanilla HTML/CSS/TypeScript dev app for testing the renderer.

**Tasks:**
- [ ] Create `src/dev-app/index.html` - Basic HTML structure with canvas and file input
- [ ] Create `src/dev-app/styles.css` - Minimal BEM-named styles
- [ ] Create `src/dev-app/main.ts` - App entry point
  - File input handler for JSON upload
  - Canvas display for rendered output
  - Render button and timing display
  - Console logging for debug output
  - Error display for failed renders
- [ ] Configure Vite to serve dev-app as entry point
- [ ] Add example JSON files to `src/dev-app/examples/` for testing

**Verification:**
- `npm run dev` starts dev server
- Can upload JSON file and see it parsed
- Canvas element displays correctly

**Reference Files:**
- `requirements.md`: Dev App Requirements section
- `old-src-ref/example1.json`, `example2.json`, `example3.json`: Test data (copy to examples folder)

---

### [ ] Step: Asset Manager Worker

Implement the Asset Manager worker for centralized asset loading.

**Tasks:**
- [ ] Create `src/js/asset-manager/index.ts` - AssetManager class
  - Image loading via fetch + createImageBitmap
  - URL-to-ID cache management
  - Asset distribution to slaves via MessagePort
  - Handle fetch, distribute, preload, register-slave messages
- [ ] Create `src/js/asset-manager/image-loader.ts` - Image loading helpers
- [ ] Create `src/workers/asset-manager.worker.ts` - Worker entry point
- [ ] Create `src/js/asset-manager/index.test.ts` - Unit tests
- [ ] Create `src/js/asset-manager/docs.md` - Documentation

**Verification:**
- Unit tests for image loading logic
- Worker can be instantiated
- Message protocol compliance

**Reference Files:**
- `spec.md`: Master ↔ Asset Manager Messages
- `old-src-ref/src/renderer/index.ts`: loadImage(), loadImages() functions (lines 223-280)

---

## Phase 2: Standard Render Slave

### [ ] Step: Layer Classification Module

Implement layer classification logic (standard vs text layers).

**Tasks:**
- [ ] Create `src/js/renderer/layer-classifier.ts`
  - Classify layers based on `mask` field type
  - String URL → standard layer
  - Object (PimcoMaskSubstitutionCompiled) → text layer
  - Return typed classification result
- [ ] Create unit tests for classification logic
- [ ] Update renderer docs.md

**Verification:**
- All classification cases tested
- Edge cases (missing mask, null values) handled

**Reference Files:**
- `spec.md`: Layer Classification section
- `old-src-ref/src/renderer/index.ts`: drawSubstitution() routing logic

---

### [ ] Step: Intra-Layer Pipeline

Implement the 5-step intra-layer rendering pipeline for standard layers.

**Tasks:**
- [ ] Create `src/js/render-slave/intra-layer-pipeline.ts`
  - Step 1: Draw base image with placement transforms
  - Step 2: Apply color/texture with blend mode and alpha
  - Step 3: Apply highlight 1 (if defined)
  - Step 4: Apply highlight 2 (if defined)
  - Step 5: Apply mask (destination-in composite)
- [ ] Create `src/js/render-slave/index.ts` - RenderSlave class
- [ ] Create unit tests for each pipeline step
- [ ] Create `src/js/render-slave/docs.md`

**Verification:**
- Each pipeline step tested independently
- Combined pipeline produces correct output
- `npm run test:unit` passes

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: drawPimcoStack() function (lines 120-221)
- `requirements.md`: Standard Render Slaves section

---

### [ ] Step: Batch Segmentation

Implement batch segmentation logic for optimized composition.

**Tasks:**
- [ ] Create `src/js/render-slave/batch-segmenter.ts`
  - Group consecutive combinable modes (source-over, screen, lighten, lighter)
  - Produce standalone segments for non-combinable modes
  - Return typed RenderSegment arrays
- [ ] Add unit tests for segmentation logic
- [ ] Update render-slave docs.md

**Verification:**
- Combinable modes correctly grouped
- Non-combinable modes produce standalone segments
- All composite modes tested

**Reference Files:**
- `spec.md`: Combinable Composite Modes section

---

### [ ] Step: Standard Render Slave Worker

Create the worker entry point for Standard Render Slave.

**Tasks:**
- [ ] Create `src/workers/render-slave.worker.ts`
  - Message handler for init, batch, abort
  - Capability probe on init
  - Asset reception handling
  - Layer rendering using intra-layer pipeline
  - Result segmentation and transfer
- [ ] Add integration with Asset Manager for asset delivery
- [ ] Update render-slave docs.md

**Verification:**
- Worker starts and responds to messages
- Capability probe returns correct values
- Abort handling works correctly

**Reference Files:**
- `spec.md`: Master ↔ Slave Messages

---

### [ ] Step: RenderMaster Core Implementation

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

### [ ] Step: Dev App Integration with Standard Rendering

Connect dev app to RenderMaster for standard layer rendering.

**Tasks:**
- [ ] Update `src/dev-app/main.ts`
  - Instantiate RenderMaster
  - Pass uploaded JSON layers to render()
  - Display ImageBitmap result on canvas
  - Show render timing
  - Handle and display errors
- [ ] Create integration test for standard rendering workflow
- [ ] Update src/tests/integration/docs.md with test documentation

**Verification:**
- Dev app renders uploaded JSON
- Timing displayed correctly
- Errors shown for invalid JSON

**Reference Files:**
- `requirements.md`: Dev App Requirements

---

## Phase 3: Text Render Slave with Effects

### [ ] Step: Font Loading in Asset Manager

Add font loading capability to Asset Manager.

**Tasks:**
- [ ] Create `src/js/asset-manager/font-loader.ts`
  - Fetch font as ArrayBuffer
  - Cache font data
  - Send font once per text slave
- [ ] Update Asset Manager to handle font asset type
- [ ] Add unit tests for font loading
- [ ] Update asset-manager docs.md

**Verification:**
- Fonts load and cache correctly
- Font data transfers to workers

**Reference Files:**
- `requirements.md`: Asset Types table

---

### [ ] Step: Text Rasterization Module

Implement text rasterization with font metrics.

**Tasks:**
- [ ] Create `src/js/text-render-slave/text-rasterizer.ts`
  - Text measurement with FontFace API
  - Canvas text rendering with proper metrics
  - Handle font properties (family, size, weight, style)
  - Support for multi-line text
- [ ] Create `src/js/text-render-slave/index.ts` - TextRenderSlave class
- [ ] Create unit tests for text rasterization
- [ ] Create `src/js/text-render-slave/docs.md`

**Verification:**
- Text renders with correct metrics
- Font properties applied correctly
- Multi-line text works

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: Text rendering in drawSubstitution()

---

### [ ] Step: 2D Transform Application

Implement 2D transform (translation, rotation, scale) for text layers.

**Tasks:**
- [ ] Add transform application to text-render-slave
  - Translation, rotation, scale via DOMMatrix or canvas transforms
  - Support transform sequence (array of transforms)
- [ ] Add post-mask application (destination-in after transforms)
- [ ] Add unit tests for transforms
- [ ] Update text-render-slave docs.md

**Verification:**
- All transform types work correctly
- Transform order preserved
- Post-mask applied correctly

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: applyWithTransformation() (lines 1343-1399), applyTransformSequence() (lines 1956-2025)

---

### [ ] Step: WebGL PostProcessor Integration and Shaders

Set up WebGL postprocessor integration and create internal shader files.

**Tasks:**
- [ ] Create `src/shaders/passthrough.vert.glsl` - Default vertex shader
- [ ] Create `src/shaders/alpha-erode.frag.glsl` - Alpha erosion shader
- [ ] Create `src/shaders/emboss.frag.glsl` - Emboss/deboss convolution shader
- [ ] Create `src/shaders/fuzz.frag.glsl` - Fuzz/blur shader for embroidery
- [ ] Create `src/shaders/normal-map.frag.glsl` - Normal map generation
- [ ] Create `src/shaders/color-scale.frag.glsl` - Color scaling/tinting
- [ ] Create `src/js/effects/index.ts` - Effects module entry point with webgl-postprocessor integration
- [ ] Create `src/js/effects/docs.md` - Document effect architecture

**Verification:**
- Shaders compile without errors
- WebGLPostProcessor initializes correctly

**Reference Files:**
- `old-src-ref/src/effects/index.ts`: Effect implementations
- `spec.md`: WebGL Post-Processor section

---

### [ ] Step: No-Effect and Shadow Effects

Implement no-effect (basic) and shadow effect pipelines.

**Tasks:**
- [ ] Create `src/js/effects/no-effect.ts`
  - Tile texture
  - Color multiply
  - Mask application
- [ ] Create `src/js/effects/shadow.ts`
  - Spread
  - White-to-alpha
  - Color fill
  - Blur
  - Multi-pass alpha
- [ ] Add unit tests for effect parameter handling
- [ ] Update effects docs.md

**Verification:**
- No-effect produces correct output
- Shadow effect matches legacy output

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: noEffect() and shadowEffect() functions
- `requirements.md`: Supported Effects table

---

### [ ] Step: Engraving and Hotstamp Effects

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

### [ ] Step: Embroidery and Metal Effects

Implement embroidery and metal effect pipelines.

**Tasks:**
- [ ] Create `src/js/effects/embroidery.ts`
  - Alpha erode
  - Tile texture
  - Color multiply
  - Emboss
  - Fuzz
  - Mask
  - Shadow
- [ ] Create `src/js/effects/metal.ts`
  - Dual emboss
  - Tile texture
  - Color multiply
  - Mask
- [ ] Add unit tests
- [ ] Update effects docs.md

**Verification:**
- Effects match legacy output
- Fuzz effect works (embroidery)

**Reference Files:**
- `old-src-ref/src/renderer/index.ts`: embroideryEffect(), metalEffect()
- `old-src-ref/src/effects/index.ts`: fuzz() function

---

### [ ] Step: Foil and Painted Effects

Implement foil and painted effect pipelines.

**Tasks:**
- [ ] Create `src/js/effects/foil.ts`
  - Alpha erode
  - Tile texture
  - Color blend
  - Dual emboss
  - Shrink mask
  - Shadow
- [ ] Create `src/js/effects/painted.ts`
  - Edge expand
  - Dual emboss
  - Inset shrink
  - Tile texture
  - Color blend
  - Mask
- [ ] Add unit tests
- [ ] Update effects docs.md

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
