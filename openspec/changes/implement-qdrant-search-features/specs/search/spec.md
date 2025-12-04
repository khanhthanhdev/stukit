## ADDED Requirements

### Requirement: Alternatives Vector Search
The system SHALL provide semantic and hybrid search capabilities for alternatives using Qdrant vector search.

#### Scenario: Search alternatives by query
- **WHEN** a user searches for alternatives with a query string
- **THEN** the system performs hybrid (dense + sparse) vector search in Qdrant
- **AND** returns alternatives ordered by relevance score
- **AND** falls back to Prisma keyword search if Qdrant returns no results above the score threshold

#### Scenario: Index alternative on creation
- **WHEN** an alternative is created or updated
- **THEN** the system generates embeddings for the alternative (name, description)
- **AND** upserts the vector to Qdrant alternatives collection
- **AND** includes metadata payload (id, slug, name, description, related tool IDs)

#### Scenario: Delete alternative vector
- **WHEN** an alternative is deleted
- **THEN** the system removes the corresponding vector from Qdrant alternatives collection

### Requirement: Categories Vector Search
The system SHALL provide semantic and hybrid search capabilities for categories using Qdrant vector search.

#### Scenario: Search categories by query
- **WHEN** a user searches for categories with a query string
- **THEN** the system performs hybrid (dense + sparse) vector search in Qdrant
- **AND** returns categories ordered by relevance score
- **AND** falls back to Prisma keyword search if Qdrant returns no results above the score threshold

#### Scenario: Index category on creation
- **WHEN** a category is created or updated
- **THEN** the system generates embeddings for the category (name, description)
- **AND** upserts the vector to Qdrant categories collection
- **AND** includes metadata payload (id, slug, name, description)

#### Scenario: Delete category vector
- **WHEN** a category is deleted
- **THEN** the system removes the corresponding vector from Qdrant categories collection

### Requirement: Related Tools Recommendations
The system SHALL provide related tool recommendations using Qdrant's recommendation API based on vector similarity.

#### Scenario: Get related tools for a tool
- **WHEN** a user views a tool detail page
- **THEN** the system uses Qdrant recommendation API to find similar tools
- **AND** returns tools ordered by similarity score
- **AND** filters results to only include published tools
- **AND** respects configurable limit and score threshold

#### Scenario: Filter related tools by category
- **WHEN** requesting related tools with a category filter
- **THEN** the system applies category filter to recommendation results
- **AND** returns only tools matching the specified category

### Requirement: Enhanced Admin Search
The system SHALL use Qdrant vector search for all entity types in admin search interface.

#### Scenario: Admin searches for categories
- **WHEN** an admin searches for categories in the admin interface
- **THEN** the system uses Qdrant hybrid search for categories
- **AND** returns results ordered by relevance
- **AND** falls back to Prisma keyword search if Qdrant search fails or returns no results

#### Scenario: Admin searches for collections
- **WHEN** an admin searches for collections in the admin interface
- **THEN** the system uses Qdrant hybrid search for collections (if indexed)
- **OR** uses Prisma keyword search as fallback
- **AND** returns results ordered by relevance

#### Scenario: Admin search mode selection
- **WHEN** an admin performs a search
- **THEN** the system supports both "keyword" and "hybrid" search modes
- **AND** defaults to "hybrid" mode when query is provided
- **AND** uses keyword mode when explicitly selected or when query is empty

### Requirement: Search Configuration
The system SHALL provide centralized search configuration for tuning search behavior.

#### Scenario: Configure search parameters
- **WHEN** search functions are called
- **THEN** they use centralized configuration for limits, score thresholds, and ef_search values
- **AND** configuration can be overridden per-query when needed
- **AND** configuration values are environment-appropriate (development vs production)

### Requirement: Collection Management
The system SHALL provide utilities for managing Qdrant collections for alternatives and categories.

#### Scenario: Setup collections
- **WHEN** the setup script is run
- **THEN** it creates alternatives and categories collections with hybrid vector configuration
- **AND** collections are created with appropriate HNSW parameters for performance
- **AND** collections include payload indexes for filtering

#### Scenario: Reindex collections
- **WHEN** reindexing is requested
- **THEN** the system fetches all alternatives and categories from Prisma
- **AND** generates embeddings and upserts vectors to Qdrant
- **AND** provides progress feedback during reindexing

## MODIFIED Requirements

### Requirement: Public Tool Search
The system SHALL provide enhanced tool search using Qdrant with improved integration and fallback behavior.

#### Scenario: Search tools with semantic mode
- **WHEN** a user searches tools with mode "semantic"
- **THEN** the system performs Qdrant hybrid search
- **AND** returns tools ordered by vector similarity score
- **AND** includes search match metadata (scores, match types) in response

#### Scenario: Search tools with hybrid mode
- **WHEN** a user searches tools with mode "hybrid"
- **THEN** the system performs both Qdrant vector search and Prisma keyword search
- **AND** combines results using Reciprocal Rank Fusion (RRF)
- **AND** returns tools ordered by combined RRF score
- **AND** includes search match metadata in response

#### Scenario: Search tools fallback behavior
- **WHEN** Qdrant search returns no results above the score threshold
- **THEN** the system automatically falls back to Prisma keyword search
- **AND** returns keyword search results to ensure users always get results when available

#### Scenario: Search tools with category filter
- **WHEN** a user searches tools with a category filter
- **THEN** the system applies category filter in Qdrant query payload
- **AND** also applies category filter in Prisma hydration query
- **AND** returns only tools matching the category

