# Memory presets

Used by the panel and API when creating/updating instances.

| Preset | MEMORY env | Typical pack size | Suggested Azure VM |
| ------ | ---------- | ----------------- | ------------------ |
| `light` | 8G | Vanilla / light Fabric | D4s_v5 |
| `standard` | 16G | Medium modpacks | D4s_v5 / D8s_v5 |
| `heavy` | 24G | ~300 mods | **D8s_v5** (32 GB RAM) |

Also enables `USE_AIKAR_FLAGS=true` on the itzg container for heavy workloads (see compose files).

Override per-instance via the `env` JSON field (`JVM_OPTS`, `MODRINTH_PROJECTS`, etc.).
