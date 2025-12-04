## ADDED Requirements
### Requirement: Global command palette trigger
The system SHALL provide a global command palette that opens via the Mod+K hotkey and a header button, closes with Escape or overlay dismissal, and is available on every page.

#### Scenario: Open and close palette
- **WHEN** a user presses Mod+K or clicks the header search button
- **THEN** the command palette opens in focus and Escape or clicking outside closes it.

### Requirement: Hybrid search execution
The palette SHALL call the Qdrant-backed hybrid search (with circuit breaker and keyword fallback) for tools and categories, and keyword search for collections and tags, returning mode metadata per entity.

#### Scenario: Semantic search with fallback
- **WHEN** a user enters a query and Qdrant returns results above the score threshold
- **THEN** the palette shows those results with `semantic` as the mode for that entity and falls back to keyword results if Qdrant is unavailable or below threshold.

### Requirement: Grouped results and navigation
The palette SHALL display grouped sections for tools, categories, collections, and tags, and selecting an item SHALL navigate to the correct detail page for that entity.

#### Scenario: Navigate from grouped results
- **WHEN** a user selects a tool, category, collection, or tag from its group
- **THEN** the app navigates to that entity’s public page using the configured route pattern for that type.

### Requirement: Idle quick links
The palette SHALL show a set of quick links (e.g., Tools, Categories, Collections, Tags, Submit) when no query is entered to aid discovery.

#### Scenario: Quick links when empty
- **WHEN** the palette is open with an empty query
- **THEN** quick links are shown and selecting one navigates immediately to that destination.

### Requirement: UX states and metadata footer
The palette SHALL provide loading indicators while searching, an empty state when no matches are found, an error state when search fails, keyboard navigation across items, and a footer that displays total hits, timing, and per-entity search mode metadata when results exist.

#### Scenario: Show states and metadata
- **WHEN** a query is in progress or fails
- **THEN** the palette shows a spinner during loading, an informative message if empty or error, arrow-key navigation remains available, and successful queries show a footer with hit counts, elapsed time, and modes used (semantic or keyword) per entity.
