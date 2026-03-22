# CCMIS Admin Refresh + Searchable Ingest Plan

## Purpose

Implement a repo-native CCMIS refresh feature for this codebase.

The feature must let **admin users** trigger a fresh scrape of USPHS policy documents, save the canonical PDF corpus to `downloads/ccmis/`, and also make the refreshed content searchable inside the existing source/sync pipeline.

This document is for an LLM implementer. It is intentionally opinionated. Follow the architecture and fallback order below rather than inventing a parallel subsystem.

## Core Product Outcome

One admin-triggered action should produce **two linked outputs**:

1. **Binary corpus**
   - fresh PDFs saved under `downloads/ccmis/`
   - these are the canonical downloaded artifacts

2. **Searchable corpus**
   - deterministic derived text files generated from the downloaded PDFs
   - those derived files are fed through the existing `file` source pipeline so they become searchable in the app

The PDFs themselves do **not** go through the current source sync system. This repo’s `file` source path is text-based.

## Why The Previous Plan Needed Revision

The earlier version captured the legacy scraping methodology correctly, but it was too standalone for this repo.

Repo truths that must shape the implementation:

- admin actions live behind Nuxt server APIs and existing `requireAdmin` auth
- long-running content work should use the repo’s Workflow-based execution model
- `sources.type` currently supports `github`, `youtube`, and `file`
- file-source uploads only accept text-like extensions
- file-source sync writes text content into sandbox `/files`, not binaries
- therefore, refreshed PDFs under `downloads/ccmis/` are **outside** the searchable pipeline unless text is derived separately

## Recommended Architecture

Use a **dual-path implementation** with one orchestrated admin refresh flow:

### Path A: CCMIS PDF Refresh

This path is responsible for:

- scraping CCMIS
- extracting document inventory
- downloading fresh PDFs
- writing reports and manifests
- saving everything to `downloads/ccmis/`

### Path B: Derived Searchable Ingest

This path is responsible for:

- extracting text from the freshly downloaded PDFs
- generating deterministic `.md` or `.json` derivative files
- associating those files with a dedicated `file` source for CCMIS-derived content
- pushing that text corpus through the existing `/api/sync` flow so the app can search it

Do **not** try to make the existing sync-docs file-source path carry PDFs directly.

## Existing Repo Integration Surfaces To Use

Anchor the implementation to these existing patterns:

- admin-only API routes under `apps/app/server/api/**`
- admin auth via the existing `requireAdmin` pattern
- source records in the existing `sources` table
- file-source storage via the existing blob-backed file source mechanism
- searchable sync via the existing `/api/sync` and workflow-based `sync-docs` path
- existing admin UI conventions in `apps/app/app/pages/admin/**`

Do not create a second “sources system” just for CCMIS.

## Feature Contract

### Admin Trigger

Provide one admin-only trigger for a CCMIS refresh.

Minimum contract:

- admin can start a refresh from the app
- refresh runs asynchronously
- trigger returns immediately with a started/running response
- refresh status can be checked without tailing server logs manually

Recommended implementation shape:

- one admin-only API endpoint to start the refresh
- one admin-only API endpoint to inspect current/last refresh status
- optional admin UI control added near other admin content-management actions

### Concurrency Rule

The refresh flow must be idempotent and safe to rerun.

Pick one explicit concurrency rule and implement it consistently:

- reject overlapping refreshes with a clear “already running” response, or
- coalesce to a single active run

Do not allow multiple overlapping CCMIS refresh jobs to mutate the same output directories concurrently.

Recommended default: **reject overlapping runs**.

## Output Model

### Binary Output

Canonical PDF destination:

- `downloads/ccmis/`

Recommended companion files:

- `downloads/ccmis_inventory.json`
- `downloads/ccmis_inventory.csv`
- `downloads/ccmis_scrape_summary.txt`
- `downloads/missing_downloads_<timestamp>.json`
- `downloads/missing_downloads_<timestamp>.txt`

### Searchable Output

Use a dedicated `file` source for CCMIS-derived text.

Recommended source concept:

- label: `CCMIS Policies`
- type: `file`
- base path: `/files`
- output path: deterministic, such as `ccmis` or a slugged stable identifier

The derived text files should be staged through the existing file-source blob/upload path and then synced through the normal sync workflow.

## Derived Text Format

For each successfully downloaded PDF, generate one deterministic derived text artifact.

Recommended format: Markdown.

Recommended filename:

- stable policy-identifier-based name when available
- otherwise a conservative filename derived from the source PDF name

Do not make the derived filename depend on scrape timestamps.

Each derived file should contain:

1. metadata header
2. extracted searchable text body

Recommended metadata fields:

- `name`
- `url`
- `filename`
- `policy_type`
- `book_series`
- `scraped_at`
- `source` set to CCMIS

Frontmatter is acceptable. A structured heading block is also acceptable. Keep the format easy to diff and easy for downstream LLMs to read.

## CCMIS Scraping Methodology

Preserve the legacy methodology from `/Users/matthewkirchoff/git/usphs-policy/usphs_policy_scraper.js`.

### Entry URL

Use:

- `https://dcp.psc.gov/ccmis/ccis/CCISToc.aspx?ShowTOC=Y`

Treat CCMIS as an ASP.NET postback-driven application.

### Primary Path: HTTP-First

Start with direct HTTP requests, not browser automation.

Required behavior:

- maintain a session cookie jar
- seed `AspxAutoDetectCookieSupport=1`
- use browser-like headers
- parse and preserve:
  - `__VIEWSTATE`
  - `__EVENTVALIDATION`
  - `__VIEWSTATEGENERATOR`
- extract node IDs from `TreeView_ToggleNode(...)`
- expand tree nodes via BFS-style postbacks with:
  - `__EVENTTARGET=ctl00$ContentPlaceHolder1$TreeView1`
  - `__EVENTARGUMENT=<node-id>`
- refresh hidden ASP.NET fields after each expansion response

### Inventory Fields

Capture deterministic metadata per document:

- `name`
- `url`
- `filename`
- `policy_type`
- `book_series`

### Filename Handling

Be conservative.

The existing `downloads/ccmis/` corpus already shows inconsistent naming:

- underscores vs periods
- encoded spaces
- suffix text
- mixed legacy patterns

Rules:

- default to the source URL filename
- do not aggressively normalize
- only sanitize when needed for filesystem safety
- do not collapse distinct files into the same local name

### Crawl Hygiene

Keep the scraper polite:

- randomized short delays
- periodic longer pauses
- retry/backoff on `403` and `429`

Do not use aggressive concurrency against CCMIS.

### HTTP Fallback

If standard HTTP requests are blocked or unreliable, use a scraping-oriented HTTP fallback such as `got-scraping`, while preserving the same stateful scrape approach.

### Browser Fallback

Use Puppeteer only when HTTP-first extraction returns zero or suspiciously few results.

If Puppeteer is needed:

- headless by default
- realistic user agent and viewport
- optional stealth support if available
- same CCMIS TOC URL
- attempt tree expansion before extracting links

### Last-Resort Recovery

If browser extraction still underperforms, allow a source-regex recovery pass for PDF paths and merge by URL.

This is the final fallback, not the default strategy.

## Download Phase

Download PDFs after inventory extraction.

Required behavior:

- write into `downloads/ccmis/`
- stream responses to disk
- use request timeout and stall timeout
- retry once per failed/stalled file
- delete partial files on failure
- continue the run even if some downloads fail
- emit machine-readable missing-download reports

Failure records should include at least:

- `filename`
- `url`
- `reason`

## Searchable Ingest Phase

After PDF refresh completes, generate derived text for the searchable system.

### Extraction Strategy

Recommended default:

- extract text from the downloaded PDFs using `@llamaindex/liteparse`
- build one derived text artifact per policy
- overwrite derived files deterministically on reruns

Use LiteParse as a **library**, not a CLI subprocess, unless library integration proves impossible in this repo.

## PDF Text Extraction With LiteParse

Use [`@llamaindex/liteparse`](https://github.com/run-llama/liteparse) as the required PDF parsing and OCR engine for the searchable-ingest path.

### Why LiteParse

LiteParse is the preferred parser for this feature because it matches the repo’s implementation lane well:

- local-first; no cloud dependency required
- TypeScript/ESM-native and suitable for direct server-side integration
- parses PDFs from `Buffer` / `Uint8Array` with zero disk I/O
- supports OCR out of the box
- can return both plain text and structured JSON with page/text-item metadata
- already aligns with this app’s existing Node/Nuxt backend environment better than adding a separate Python OCR/parser stack

### Integration Mode

The implementation should use LiteParse as an imported library in backend/workflow code.

Default approach:

- add `@llamaindex/liteparse` as an app dependency
- import `LiteParse` in the server/workflow extraction code
- parse downloaded PDFs by file path or bytes
- use LiteParse output to build the derived searchable files

Do **not** default to shelling out to:

- `lit parse`
- `liteparse`

CLI wrapping is a fallback only if direct library use is blocked by a verified runtime issue.

### OCR Mode

Default OCR mode is LiteParse built-in Tesseract.

Required default behavior:

- `ocrEnabled: true`
- built-in Tesseract.js path used unless the implementation later adds optional OCR-server configuration
- support `TESSDATA_PREFIX` for offline or preloaded language data

Do not make a custom OCR HTTP server part of v1 requirements. It is an allowed future extension only.

### Recommended LiteParse Configuration

Use a conservative server/workflow configuration tuned for correctness and runtime safety.

Recommended defaults:

- `ocrEnabled: true`
- `outputFormat: "json"`
- `ocrLanguage: "eng"` unless config later makes this explicit
- conservative `dpi` suitable for OCR without excessive memory pressure
- conservative worker count rather than saturating all cores
- optional page targeting only if a later optimization proves necessary

Use JSON output during extraction so the implementation can:

- retain structured page/text metadata when useful
- build deterministic markdown/text derivatives from a stable parse result

The final searchable artifact should still be markdown-first unless a later requirement demands JSON-first search documents.

### Runtime Placement

LiteParse and its stack are heavier than a lightweight request helper.

The plan should assume this work runs in the admin-triggered async workflow/backend lane, not in:

- the read-only documentation sandbox path
- a latency-sensitive request/response route that tries to finish the whole parse inline

This matters because LiteParse brings native/wider-runtime dependencies such as:

- `@hyzyla/pdfium`
- `sharp`
- `tesseract.js`

Use the workflow/job path for parsing and derivation so heavy PDF/OCR work stays out of the normal read-only search flow.

### Derived File Construction

For each successfully downloaded PDF:

1. parse the PDF with LiteParse
2. collect the extracted full text
3. create a deterministic markdown derivative
4. include metadata in frontmatter or a structured header
5. write or stage the derivative into the CCMIS file-source ingest path

Minimum metadata to preserve:

- `name`
- `url`
- `filename`
- `policy_type`
- `book_series`
- `scraped_at`
- `source: CCMIS`

Recommended markdown shape:

- frontmatter or structured metadata block
- normalized title
- extracted body text

Optional debugging artifact:

- adjacent JSON derived from LiteParse output, only if needed for troubleshooting, ranking experiments, or future layout-aware extraction

Do not require adjacent JSON in v1 unless the implementation specifically benefits from it.

### Operational Caveats

The implementation must respect LiteParse behavior:

- built-in Tesseract may download language data on first use unless `TESSDATA_PREFIX` is configured
- OCR should remain enabled by default because some CCMIS PDFs may be scanned or text-sparse
- if LiteParse already returns usable text for text-rich PDFs, do not add a second parser layer
- if OCR initialization fails for a subset of files, continue the run where possible and surface the failures clearly
- if LiteParse has a verified blocking gap for a specific PDF, record that failure instead of silently falling back to an unrelated parser

### Future Extension Path

A custom OCR server is allowed later, but only as an explicit extension.

If added in the future, it should use LiteParse’s OCR server integration rather than replacing LiteParse itself.

## Non-Goals For PDF Extraction

Do not do the following unless a hard blocker forces it:

- do not shell out to LiteParse CLI by default
- do not add a second PDF parser beside LiteParse without a verified blocking issue
- do not redesign the admin/source architecture around LiteParse
- do not move PDF extraction into the read-only sandbox search path
- do not require a custom OCR server for v1

### Staging Strategy

Use the existing `file` source path rather than inventing a new custom source type.

Recommended sequence:

1. ensure a dedicated CCMIS file source exists
2. stage derived text files through the existing blob/file-source mechanism
3. trigger the normal sync workflow for that source
4. let the existing workflow write those text files into sandbox `/files`

### Update Semantics

- do not delete local PDFs unless implementing an explicit reconciliation mode
- derived text files should overwrite deterministically
- failed PDFs should not block searchable ingest for successful PDFs
- if failure rate is extreme, the run may fail overall, but partial success should still be observable in reports/status

## Admin UX Expectations

The final implementation should feel native to the existing admin surface.

Minimum UX expectations:

- admin can start the refresh without shell access
- UI shows started/running/succeeded/failed state
- UI surfaces last run time and summary
- UI shows whether searchable ingest also completed
- UI surfaces missing-download count or report link when failures occur

Do not require admins to interpret raw workflow logs for normal operation.

## Non-Goals

Do not do the following unless a hard blocker forces a change:

- do not create a brand-new `ccmis` source type
- do not try to push raw PDFs through the current text-only file-source sync flow
- do not replace the HTTP-first CCMIS strategy with browser-only scraping
- do not skip ASP.NET state handling
- do not build a separate admin management system outside the existing routes/UI/auth patterns
- do not hammer CCMIS with parallel scraping bursts

## Recommended Implementation Order

1. Add repo-native admin refresh/status contracts.
2. Add workflow/job orchestration for CCMIS refresh.
3. Implement or adapt the HTTP-first CCMIS scraper.
4. Write inventory outputs and download PDFs into `downloads/ccmis/`.
5. Add retry, stall timeout, and missing-download reports.
6. Add derived text extraction from downloaded PDFs.
7. Reserve or create a dedicated CCMIS `file` source.
8. Stage derived text files through the existing file-source path.
9. Trigger the normal sync workflow for searchable ingest.
10. Add admin UI affordances for trigger + status.
11. Verify reruns, overlap handling, and partial-failure behavior.

## Verification Checklist

Before declaring the implementation complete, verify all of the following:

- repo auth pattern used is admin-only
- the trigger is asynchronous and safe for long-running jobs
- concurrent refreshes are rejected or coalesced explicitly
- PDFs are written to `downloads/ccmis/`
- scrape inventory includes deterministic metadata
- file naming remains conservative
- missing-download reports are emitted
- derived text files are generated from successful PDFs
- searchable ingest uses the existing `file` source model
- sync is triggered through the existing sync workflow, not a parallel ingestion path
- no claim is made that raw PDFs are searchable through the current sync system

## Source Of Truth

Scraper methodology:

- `/Users/matthewkirchoff/git/usphs-policy/usphs_policy_scraper.js`
- `/Users/matthewkirchoff/git/usphs-policy/config.json`
- `/Users/matthewkirchoff/git/usphs-policy/docs/readme_scrapers.md`

Repo integration constraints:

- `apps/app/server/db/schema.ts`
- `apps/app/server/api/sources/[id]/files.put.ts`
- `apps/app/server/api/sync/index.post.ts`
- `apps/app/server/utils/sandbox/source-sync.ts`
- `apps/app/app/pages/admin/index.vue`

LiteParse source truth:

- `https://github.com/run-llama/liteparse`
- `https://raw.githubusercontent.com/run-llama/liteparse/main/README.md`
- `https://raw.githubusercontent.com/run-llama/liteparse/main/src/lib.ts`
- `https://raw.githubusercontent.com/run-llama/liteparse/main/src/core/parser.ts`
- `https://raw.githubusercontent.com/run-llama/liteparse/main/OCR_API_SPEC.md`

## Default Decisions

Unless there is a concrete blocker, the implementer should assume:

- admin-only trigger
- asynchronous workflow execution
- overlap rejection instead of parallel runs
- PDF storage in `downloads/ccmis/`
- LiteParse library integration for PDF text extraction
- built-in Tesseract OCR for v1, with optional `TESSDATA_PREFIX` support
- derived Markdown for searchable ingest
- dedicated `file` source for CCMIS-derived text
- existing source/sync system reused rather than extended with a new source type
