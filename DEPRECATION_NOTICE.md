# Database Schema Deprecation Notice

This document tracks deprecated database columns and features that will be removed in future versions.

## Overview

As part of the migration to a more stable container matching system, several database columns have been deprecated. This document serves as a reference for developers and users about what will be removed and when.

---

## Deprecated Columns

### `shortcuts.container_id` (Deprecated: 2026-02-13)

**Status**: ⚠️ DEPRECATED - Will be removed in **v1.0.0** (estimated: May 2026)

**Reason**: 
- Docker container IDs change every time a container is restarted
- This makes shortcuts unreliable and causes them to break after container restarts
- Replaced by `container_name` and `container_match_name` for stable matching

**Migration Path**:
- ✅ **Migration 003** (`003_migrate_container_names`): Automatically migrated existing `container_id` values to `container_name`
- ✅ **Migration 008** (`008_add_container_match_name`): Added `container_match_name` column for stable matching
- ✅ **Frontend Migration**: All frontend code now uses `container_name`/`container_match_name` instead of `container_id`

**Current Usage**:
- Column is still present in the database for backward compatibility
- **NOT used** for container matching in frontend (as of 2026-02-13)
- **NOT used** for container matching in backend (as of 2026-02-13)
- Only kept for legacy data and potential rollback scenarios

**Replacement**:
- Use `container_name` for the base container name (e.g., `postgres-adminer`)
- Use `container_match_name` for stable matching across container restarts

**Timeline**:
- **2026-02-13**: Deprecated, migrations completed
- **2026-03-13** (1 month): Add console warning when `container_id` is present but `container_match_name` is missing
- **2026-04-13** (2 months): Add UI banner warning users about upcoming removal
- **2026-05-13** (3 months): Remove column in v1.0.0 release

---

### `shortcuts.original_container_name` (Removed: 2026-02-13)

**Status**: ✅ REMOVED

**Reason**: 
- Column was added during early migration experiments
- Never used in production code
- Removed in **Migration 010** (`010_cleanup_deprecated_columns`)

**Migration Path**:
- ✅ Automatically removed by migration system

---

## Replacement Strategy

### Old Approach (Deprecated)
```typescript
// ❌ DON'T USE - container_id changes on restart
const container = containers.find(c => c.id === shortcut.container_id);
```

### New Approach (Current)
```typescript
// ✅ USE THIS - stable across restarts
const matchName = shortcut.container_match_name || shortcut.container_name;
const container = matchName
  ? containers.find(c => {
      const containerBaseName = c.name.replace(/-\d+$/, "").toLowerCase();
      return containerBaseName === matchName.toLowerCase();
    })
  : null;
```

---

## Migration History

| Migration | Date | Description | Status |
|-----------|------|-------------|--------|
| 003 | 2026-02-13 | Migrate `container_id` → `container_name` | ✅ Complete |
| 008 | 2026-02-13 | Add `container_match_name` column | ✅ Complete |
| 009 | 2026-02-13 | Add database indexes | ✅ Complete |
| 010 | 2026-02-13 | Remove `original_container_name` | ✅ Complete |
| TBD | 2026-05-13 | Remove `container_id` column | ⏳ Planned |

---

## For Developers

### Checking for Deprecated Usage

Search your codebase for these patterns:

```bash
# Find usage of container_id in frontend
grep -r "container_id" frontend/src/

# Find usage of container_id in backend
grep -r "container_id" src/
```

### Safe Migration Checklist

- [ ] Replace all `container_id` references with `container_name` or `container_match_name`
- [ ] Update container matching logic to use base name matching
- [ ] Test that shortcuts survive container restarts
- [ ] Verify that custom shortcuts (non-container) don't have `container_match_name`
- [ ] Run migrations on test database before production

---

## For Users

### What This Means for You

**Good News**: 
- Your shortcuts will now survive container restarts! 🎉
- No manual action required - migrations run automatically

**What Changed**:
- Shortcuts are now linked to containers by **name** instead of **ID**
- This means restarting a container won't break your shortcuts
- All existing shortcuts have been automatically migrated

**Upcoming Changes** (May 2026):
- The old `container_id` column will be completely removed
- You'll see a warning banner 2 months before removal
- No action needed - this is just cleanup of old data

---

## Questions?

If you have questions about these deprecations or need help migrating custom code:

1. Check the [Migration Guide](./MIGRATION_GUIDE.md) (if available)
2. Review the migration code in `src/database/migrations.ts`
3. Open an issue on GitHub

---

**Last Updated**: 2026-02-13  
**Next Review**: 2026-03-13 (Add deprecation warnings)

