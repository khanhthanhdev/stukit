## 1. Implementation
- [x] 1.1 Add/adjust server action that exposes Qdrant hybrid search for tools/categories/collections/tags to unauthenticated users with keyword fallback and mode metadata.
- [x] 1.2 Build command palette UI (dialog, grouped results, quick links, keyboard navigation, loading/empty/error states) and wire it to the search action.
- [x] 1.3 Add global provider/trigger (layout + header button + Mod+K shortcut) to open/close the palette anywhere on the site.
- [x] 1.4 Ensure routing targets are correct per entity type and include mode/timing info in the footer; surface graceful fallback when Qdrant is down.

## 2. Validation
- [x] 2.1 Run `openspec validate add-command-palette-search --strict`.
- [ ] 2.2 Manual check: Mod+K opens/closes palette, search returns grouped results, navigation works, fallback and errors show, mode metadata reflects Qdrant vs keyword.
