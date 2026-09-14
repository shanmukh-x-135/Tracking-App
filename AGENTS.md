# AGENTS.md

## Purpose

This repository is a production-oriented web application for a unified media tracking platform covering:

- Movies
- TV series
- Video games
- Books

The long-term product combines the depth of specialist products such as Serializd, Letterboxd, Backloggd, and Fable while maintaining one unified identity, diary, social graph, lists, discovery system, and statistics layer.

This file defines repository-wide instructions for Codex and other coding agents.

Treat these instructions as persistent engineering constraints unless a more specific instruction in the current task explicitly overrides them.

---

# 1. Core Engineering Principles

## 1.1 Build for long-term maintainability

Do not optimize only for completing the immediate prompt.

Prefer solutions that:

- preserve clear domain boundaries
- minimize unnecessary coupling
- are easy to test
- are easy to extend
- keep UI and data concerns separate
- avoid architectural rewrites later
- remain understandable to another engineer entering the project

Do not introduce abstractions merely for theoretical flexibility.

Use abstraction when at least one of the following is true:

- behavior is already shared in multiple places
- a domain concept clearly has multiple implementations
- duplication would create maintenance risk
- the abstraction reflects an actual product concept

Avoid speculative abstraction.

---

## 1.2 Prefer correctness over cleverness

Code should be:

- explicit
- readable
- typed
- boring where possible
- easy to debug

Avoid:

- obscure metaprogramming
- unnecessary factories
- dependency-heavy solutions for trivial problems
- compressed one-liners that reduce readability
- clever state tricks
- premature optimization

---

## 1.3 Preserve domain-specific behavior

Movies, TV, games, and books share a common media foundation, but they are not identical products.

Do not flatten all four media types into one generic status model.

Examples:

Movies:
- watched
- watch date
- rewatch
- rating
- review

TV:
- show
- season
- episode
- episode progress
- episode rating
- season/show ratings

Games:
- backlog
- playing
- completed
- dropped
- playthroughs
- platforms
- playtime
- completion progress

Books:
- want to read
- reading
- finished
- DNF
- page/percentage progress
- reading sessions

Shared components are encouraged, but domain behavior must remain explicit.

---

# 2. Expected Technology Stack

Unless the repository already establishes a compatible alternative, prefer:

- Next.js 15+
- App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI primitives
- Lucide icons
- Motion / Framer Motion only where justified
- Next/Image for image-heavy media views

Do not replace an established stack without a strong reason.

Before adding dependencies:

1. inspect existing dependencies
2. determine whether the requirement can be solved with what is already installed
3. prefer platform/framework APIs for simple needs
4. add a package only if it materially improves correctness, accessibility, maintainability, or development speed

Do not install large libraries for trivial helpers.

---

# 3. Repository Inspection Rules

Before making meaningful changes:

1. inspect the repository root
2. read this `AGENTS.md`
3. read any nested `AGENTS.md`
4. read `README.md`
5. inspect `package.json`
6. inspect framework/tooling configs
7. inspect relevant source directories
8. inspect existing types and shared components
9. inspect current tests
10. inspect Git status

Do not assume the repository is blank.

Do not overwrite or replace useful existing work without understanding it first.

If the existing architecture differs from a task description, adapt thoughtfully rather than bulldozing the existing implementation.

---

# 4. MCP and Skill Usage

Agents are expected to actively inspect and use available MCPs, skills, and development tools when they improve implementation quality.

Do not ignore available tools and manually reinvent functionality that the environment already supports well.

---

## 4.1 Context7 MCP

Use the Context7 MCP whenever current, version-specific, or authoritative framework/library documentation would materially reduce implementation risk.

Context7 should be used especially when:

- working with recently changed Next.js APIs
- implementing App Router behavior
- working with React APIs whose current behavior may differ from older versions
- using Tailwind features or configuration that may have changed
- integrating shadcn/ui
- integrating Radix UI
- integrating Motion / Framer Motion
- using third-party libraries with version-sensitive APIs
- resolving deprecation warnings
- implementing framework-specific performance features
- implementing metadata, caching, server/client boundaries, actions, routing, or image behavior
- an API is unfamiliar or uncertain
- the implementation relies on behavior that should be verified rather than guessed

Do not use Context7 for trivial JavaScript or CSS questions that are already unambiguous.

When documentation conflicts with memory, prefer current authoritative documentation.

Do not guess at modern framework APIs if Context7 can verify them.

---

## 4.2 21st.dev / 21st MCP

Use 21st.dev as a component and interaction reference where appropriate.

Search before building major polished UI patterns such as:

- navigation
- media shelves
- command palettes
- search overlays
- dialogs
- sheets
- carousels
- floating action controls
- profile sections
- activity feeds
- segmented controls
- filtering interfaces
- responsive navigation
- cards with sophisticated interactions

Rules:

- do not blindly copy random components
- do not let 21st define the product identity
- adapt components to repository design tokens
- verify accessibility
- remove unused dependencies
- keep component APIs clean
- keep the final interface visually coherent

If a useful 21st component cannot be installed, reproduce the interaction locally using existing primitives.

---

## 4.3 Browser / Playwright / Visual MCPs

If browser automation or a browser MCP is available, use it for UI work.

Visual QA is mandatory for significant frontend changes.

At minimum inspect:

- desktop
- laptop
- tablet
- mobile

Recommended widths:

- 1440px
- 1280px
- 1024px
- 768px
- 390px

Use browser tooling to validate:

- navigation
- responsive layouts
- dialogs
- sheets
- command search
- hover states
- focus states
- overflow
- image loading
- text truncation
- sticky elements
- mobile safe areas
- route transitions
- console errors

Do not consider a UI task complete merely because the source code looks plausible.

---

## 4.4 Other MCPs and Skills

Inspect available MCPs/skills before large tasks.

Use specialized tools when relevant for:

- framework documentation
- component discovery
- design systems
- browser automation
- testing
- accessibility
- databases
- API inspection
- code search
- code quality

Use tools purposefully.

Do not create unnecessary tool-call overhead for simple work.

---

# 5. Product Design Direction

The product should feel like a premium consumer entertainment application.

Primary structural inspiration:

- Serializd

Secondary product references:

- Letterboxd
- Backloggd
- Fable

The product should remain original.

Do not clone proprietary layouts, branding, artwork, wording, or assets.

---

## 5.1 Visual language

Primary direction:

**Serializd-like media density + restrained Apple Liquid Glass principles**

Default experience:

- dark mode
- near-black backgrounds
- artwork-first layouts
- translucent navigation
- layered depth
- subtle blur
- thin borders
- restrained highlights
- excellent typography
- polished transitions

Glass should primarily be used for:

- navigation
- floating controls
- search surfaces
- modals
- sheets
- filter bars
- segmented controls
- hover/action overlays

Do not make every card glass.

Media art should remain dominant.

Avoid:

- generic purple SaaS styling
- neon cyberpunk styling
- giant gradients everywhere
- excessive blur
- excessive glow
- huge dashboard cards
- over-rounded components
- excessive animation
- enterprise admin-panel aesthetics

---

# 6. Design System Rules

Use centralized tokens.

Do not scatter repeated arbitrary values across components.

Prefer CSS variables for major semantic values.

Example token categories:

- background
- elevated background
- surface
- surface hover
- glass
- strong glass
- glass border
- glass highlight
- primary foreground
- secondary foreground
- muted foreground
- accent
- accent hover
- rating
- success
- warning
- danger

Use semantic names rather than color names where possible.

Example:

Good:

```css
--foreground-muted
--surface-hover
```

Avoid:

```css
--gray-347
--purple-card
```

---

# 7. TypeScript Rules

Use strict TypeScript.

Avoid `any`.

If `any` is genuinely unavoidable:

- isolate it
- explain why
- keep its scope minimal

Prefer:

- discriminated unions
- explicit return types on exported helpers
- typed component props
- domain types
- narrow state types

Avoid duplicated type definitions.

Shared domain types should live in a logical shared location.

Do not build one gigantic universal media type containing dozens of optional fields.

Prefer a shared base plus domain-specific extensions.

Example:

```ts
type MediaType = "movie" | "tv" | "game" | "book";

interface MediaBase {
  id: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string;
  releaseYear?: number;
}

interface Movie extends MediaBase {
  mediaType: "movie";
  runtime?: number;
  director?: string;
}

interface TvSeries extends MediaBase {
  mediaType: "tv";
  seasonCount?: number;
  episodeCount?: number;
}
```

Use discriminated unions when rendering type-specific behavior.

---

# 8. React Rules

Prefer:

- small focused components
- composition
- local state where appropriate
- server components by default where compatible
- client components only when interaction requires them

Do not mark large trees `"use client"` without need.

Keep client boundaries narrow.

Avoid:

- prop drilling across many layers
- giant page components
- monolithic state objects
- unnecessary global state
- effects for derived state
- effects that merely synchronize props into state

Use derived values directly when possible.

Do not use `useEffect` as a general-purpose event system.

---

# 9. Next.js Rules

Prefer App Router conventions.

Use:

- layouts appropriately
- route groups where they improve organization
- loading states when useful
- error boundaries when meaningful
- server components for static/data-oriented views
- client components for interaction

Verify modern Next.js behavior with Context7 whenever uncertain.

Do not:

- use legacy Pages Router patterns in new App Router code
- invent caching semantics from memory
- misuse server/client boundaries
- create unnecessary API routes for logic that belongs elsewhere

---

# 10. Tailwind / Styling Rules

Keep styling intentional.

Avoid long unreadable class strings when a component has repeated complex styling.

Extract meaningful reusable variants.

Use a helper such as `cn()` if already available.

Prefer semantic component variants over duplicated class fragments.

Do not build a giant custom CSS framework on top of Tailwind.

Use CSS modules or plain CSS only when they clearly improve implementation.

---

# 11. UI Component Rules

Use shared primitives for recurring interaction patterns.

Likely shared components include:

- MediaCard
- MediaPoster
- MediaShelf
- RatingDisplay
- RatingInput
- MediaTypeBadge
- UserAvatar
- ReviewCard
- ActivityItem
- GlassSurface
- SegmentedControl
- ProgressDisplay
- EmptyState
- SearchResultItem

Do not force one component to handle unrelated layouts through dozens of boolean props.

Prefer variants.

Example:

```tsx
<MediaCard variant="poster" />
<MediaCard variant="compact" />
<MediaCard variant="continue" />
```

instead of:

```tsx
<MediaCard
  compact
  horizontal
  showProgress
  showRating
  tinyPoster
  noDescription
/>
```

---

# 12. State Management

Do not introduce global state management prematurely.

Use:

- component state for local interactions
- URL state for shareable filters/search/sort where appropriate
- server state tools only when real backend integration exists
- context only for genuinely cross-cutting client state

If global state becomes justified later, choose a lightweight solution compatible with actual needs.

Do not add Redux by default.

---

# 13. Data Modeling Rules

The application must preserve a shared-media layer plus domain-specific detail.

Conceptually support:

Shared:
- Media
- User
- Rating
- Review
- MediaLog
- List
- ListItem
- ActivityItem

Movies:
- MovieWatch

TV:
- Series
- Season
- Episode
- EpisodeWatch
- SeasonRating
- SeriesRating

Games:
- Game
- GamePlaythrough
- GameSession
- GamePlatform

Books:
- Book
- ReadingProgress
- ReadingSession

Do not implement all backend entities unless the current phase requires them.

However, frontend architecture should not block these concepts later.

---

# 14. Lists

Lists are cross-media by design.

A list may contain:

- movie
- series
- game
- book

Do not architect lists as media-type-specific unless a specialized secondary list type is intentionally introduced later.

---

# 15. Search

Search is universal.

It should be capable of handling:

- Movies
- Series
- Games
- Books
- Users

Keep result rendering domain-aware.

Do not flatten all result metadata into identical rows.

---

# 16. Accessibility

Accessibility is mandatory.

All significant UI must support:

- keyboard navigation
- visible focus indicators
- semantic HTML
- meaningful labels
- dialog focus management
- accessible controls
- sufficient color contrast
- reduced-motion preferences
- alternative text handling
- screen-reader-friendly names

Do not use transparency or artwork backgrounds in ways that compromise text readability.

Icon-only controls must have accessible labels.

Interactive non-button elements should generally be replaced with actual buttons/links.

---

# 17. Responsive Design

Responsive behavior must be deliberate.

Do not treat mobile as desktop stacked vertically.

Desktop may use:

- floating top navigation
- hover actions
- wider shelves
- richer metadata

Mobile may use:

- bottom navigation
- swipeable shelves
- sheets
- touch-first actions
- reduced metadata density
- safe-area padding

Test real breakpoints visually.

---

# 18. Motion

Motion should communicate hierarchy and state.

Use motion for:

- dialog appearance
- sheet appearance
- navigation changes
- tab transitions
- card hover
- progress updates
- subtle route transitions

Avoid animation for decoration alone.

Typical interaction duration:

- approximately 150–300 ms

Respect `prefers-reduced-motion`.

Avoid:

- slow cinematic UI animations
- unnecessary parallax
- dramatic 3D tilt
- constant background animation

---

# 19. Performance

This is an image-heavy application.

Optimize accordingly.

Prefer:

- Next/Image
- lazy loading
- properly sized media
- responsive image sizes
- stable aspect-ratio containers
- limited simultaneous blur layers

Avoid:

- rendering huge original assets into tiny cards
- layout shift
- dozens of heavy backdrop filters
- unnecessary client-side hydration
- excessive animation libraries
- repeated expensive calculations during render

Measure before making complex optimizations.

---

# 20. Error Handling

Handle expected errors intentionally.

User-facing errors should be:

- understandable
- concise
- actionable

Do not expose raw stack traces or internal implementation detail in production UI.

In development, preserve useful diagnostics.

Do not silently swallow meaningful errors.

---

# 21. Loading / Empty States

Every important async or collection-driven view should eventually support:

- loading
- empty
- success
- error

Empty states should be product-aware.

Avoid generic messages such as:

> No data.

Prefer:

> Your watchlist is empty. Add something you want to watch.

Do not over-design loading skeletons.

---

# 22. Testing Expectations

Run the existing test suite after meaningful changes.

For new logic, add tests where they provide real value.

Prioritize tests for:

- domain transformations
- state transitions
- filters
- sorting
- rating logic
- progress calculations
- reusable utilities
- complex interactive behavior

Do not write shallow tests solely to increase test count.

For important UI interactions, use the repository's preferred integration/browser testing strategy.

---

# 23. Required Validation Before Finishing

For substantial changes, run the applicable commands.

At minimum:

- lint
- typecheck
- tests
- build

Fix meaningful warnings and errors.

Do not declare completion when:

- TypeScript fails
- lint fails materially
- build fails
- routes crash
- hydration warnings exist
- browser console contains obvious runtime errors

If a validation step cannot run because of environment limitations, explain that clearly in the final summary.

---

# 24. Visual QA Checklist

For major frontend tasks, inspect the rendered product.

Check:

- overall visual hierarchy
- navigation
- poster ratios
- image cropping
- long titles
- long usernames
- long reviews
- empty sections
- overflowing metadata
- mobile bottom navigation
- safe-area behavior
- tablet layouts
- focus states
- hover states
- modal behavior
- sheet behavior
- search keyboard navigation
- keyboard shortcuts
- text contrast over artwork
- dark background consistency
- animation smoothness

Fix issues discovered during visual review before finishing.

---

# 25. File and Component Size

Avoid enormous files.

As a guideline, investigate refactoring when:

- a component exceeds roughly 300–400 lines
- a page contains many unrelated subcomponents
- a file mixes domain logic, rendering, and utilities
- repeated UI blocks emerge

This is guidance, not an arbitrary hard limit.

Do not split tiny components into dozens of files solely to meet a line count.

---

# 26. Naming

Use clear product/domain terminology.

Prefer:

- `SeriesDetail`
- `EpisodeRating`
- `GamePlaythrough`
- `ReadingProgress`
- `MediaShelf`

Avoid vague names:

- `Thing`
- `Item2`
- `DataBox`
- `ContentStuff`
- `NewCard`

Boolean names should read naturally:

- `isWatched`
- `hasReview`
- `canEdit`

---

# 27. Comments

Comments should explain:

- why
- constraints
- non-obvious behavior
- temporary workarounds

Do not narrate obvious code.

Bad:

```ts
// increment count
count++;
```

Useful:

```ts
// Keep progress below 100 until a completion event is recorded;
// some providers report rounded page counts.
```

---

# 28. Documentation

Update repository documentation when behavior, setup, architecture, or environment requirements change.

Do not leave setup instructions outdated.

If a new environment variable is introduced:

- document it
- provide a safe example
- never commit secrets

---

# 29. Environment Variables and Secrets

Never hard-code:

- API keys
- access tokens
- passwords
- secrets
- private connection strings

Use environment variables.

Do not commit real secret values.

Use `.env.example` where appropriate.

---

# 30. Git Discipline

Before editing:

- inspect `git status`

After editing:

- inspect the diff
- ensure only intended files changed

Do not:

- rewrite unrelated code
- reformat the entire repository unnecessarily
- delete user work
- force reset
- alter Git history
- commit secrets
- create destructive migrations casually

Keep changes scoped.

If the user asks for a commit, use a concise conventional commit-style message when appropriate.

Examples:

- `feat: add unified media search`
- `feat: add series episode tracking UI`
- `fix: prevent mobile nav overlap`
- `refactor: split media card variants`

Do not commit unless explicitly asked or the environment/task specifically requires it.

---

# 31. Dependency Discipline

Before adding a dependency, answer:

1. Is similar functionality already installed?
2. Is this functionality trivial to implement locally?
3. Is the package actively maintained?
4. Does it add significant bundle weight?
5. Is it compatible with the current framework?
6. Does it materially improve accessibility or correctness?

Use Context7 or authoritative documentation when version compatibility is uncertain.

Remove abandoned experimental dependencies.

---

# 32. API Integration Rules

When real media APIs are introduced later:

- isolate providers behind adapter layers
- do not leak provider response shapes throughout the UI
- normalize external IDs carefully
- preserve provider attribution requirements
- handle missing artwork
- handle missing release dates
- handle regional differences
- handle partial metadata
- cache responsibly
- respect rate limits

Potential provider domains may eventually include:

- movies / TV
- games
- books

Do not build provider coupling directly into presentation components.

---

# 33. Mock Data

During prototype phases, mock data should look realistic.

Do not use:

- `Movie 1`
- `Show 2`
- `Lorem ipsum`
- random placeholder statistics

Use coherent development fixtures that demonstrate real states:

- watched
- currently watching
- playing
- reading
- reviewed
- unrated
- dropped
- completed

Keep mock data in dedicated fixture/data files rather than embedding large objects directly inside page components.

---

# 34. Product Copy

UI copy should be concise and natural.

Avoid robotic labels.

Prefer:

- `Continue Watching`
- `Popular with Friends`
- `Update Progress`
- `Your Activity`
- `Add to List`

Avoid:

- `Media Consumption Dashboard`
- `Content Management Interface`
- `Submit Media Status`

This is a consumer product.

---

# 35. Ratings

Do not assume every future domain must use identical rating presentation internally.

The UI may expose a unified rating scale, but preserve flexibility in the domain layer.

Any conversion logic should live in one location.

Do not duplicate rating conversion math across components.

---

# 36. Social Features

When social features are introduced:

- activity should be media-aware
- spoiler-sensitive content must be handled intentionally
- reviews should preserve authorship
- likes/comments should be clearly modeled
- public/private boundaries should be explicit

Do not build a generic "social feed" model that loses the underlying media action.

Example activity types may include:

- rated_movie
- watched_episode
- completed_game
- updated_book_progress
- reviewed_media
- created_list

---

# 37. Spoiler Safety

TV and narrative-heavy media require spoiler-aware UI.

Future reviews and discussions should support spoiler metadata.

Do not expose episode review text casually in contexts where the user may not have reached that episode.

Design components so spoiler treatment can be added cleanly.

---

# 38. Logging Architecture

The unified Log experience must dispatch to domain-specific flows.

Do not implement one enormous generic form.

Conceptually:

```text
Log
├── Movie log
├── TV / episode log
├── Game update / playthrough
└── Book progress / completion
```

Shared shell is encouraged.

Domain-specific controls are required.

---

# 39. Cross-Media Features

Cross-media functionality is a core differentiator.

Preserve support for:

- universal search
- cross-media lists
- unified diary/activity
- unified profile
- unified recommendations later
- franchise/universe grouping later
- combined statistics later

Do not isolate each domain so aggressively that unified features become difficult.

The architecture should have both:

- shared media identity
- domain-specific behavior

---

# 40. Scope Discipline

Do not implement future features simply because they are mentioned in product vision.

If a task is specifically Phase 1 UI work, do not spend time on:

- production auth
- payment systems
- recommendations
- moderation
- AI features
- full database schemas
- import pipelines
- social notifications backend
- analytics infrastructure

Build enough architecture to support future work without implementing everything prematurely.

---

# 41. Final Agent Workflow

For every substantial task:

1. read relevant instructions
2. inspect repository state
3. understand existing architecture
4. inspect available MCPs/skills
5. use Context7 when current documentation is needed
6. use 21st.dev when polished reusable UI patterns are relevant
7. make a short implementation plan
8. implement the smallest coherent solution
9. keep domain boundaries clear
10. run lint/typecheck/tests/build
11. launch the app when UI changed
12. visually inspect key routes
13. fix issues found during QA
14. review the Git diff
15. summarize:
   - what changed
   - important architectural decisions
   - validation performed
   - known limitations
   - sensible next steps

Do not stop at scaffolding if the requested feature can reasonably be completed.

Do not ask the user to choose every minor implementation detail.

Make strong engineering decisions consistent with this repository and product direction.

---

# 42. Priority Order When Instructions Conflict

Use this priority order:

1. safety/security constraints
2. explicit current user request
3. nested/local `AGENTS.md` instructions closest to the edited file
4. this repository-level `AGENTS.md`
5. existing repository conventions
6. general best practices

When uncertain, preserve existing working behavior and minimize destructive change.

---

# 43. Import and Portability Invariants

- Treat every external export as untrusted input. Enforce authentication, size/type limits, safe archive paths, bounded parsing, and sanitized errors.
- Import parsers must produce stable source record keys. Re-imports and retries must remain idempotent.
- Resolve imported media through provider identity or conservative reconciliation; never blindly match on title alone or across media types.
- Preserve import provenance. Undo may remove only unchanged rows created by that import and must preserve later user edits.
- Keep Mosaic account data exportable through a documented, versioned machine-readable format. Any emitted CSV must neutralize spreadsheet formula prefixes.
- Do not claim native import support for a platform without a trustworthy documented or user-provided export contract.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
