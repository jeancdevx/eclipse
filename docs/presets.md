# Memory presets

Used by the panel and API when creating/updating instances.

The API **clamps** `MEMORY` to ~45% of game-host RAM (`GAME_HOST_MEMORY_MB`, default 16384 on Azure D4). A 16 GB VM cannot run a 16G JVM heap.

| Preset | MEMORY env | Fits Azure D4 (16 GB)? | Suggested Azure VM |
| ------ | ---------- | ---------------------- | ------------------ |
| `light` | 8G | Yes | D4s / D4ads |
| `standard` | 16G | No — capped to ~12G on D4 | **D8** (32 GB) |
| `heavy` | 24G | No — capped on D4 | **D8 / D16** |

The API leaves ~4 GiB of host RAM for OS/Docker, then clamps `MEMORY` to the rest (`GAME_HOST_MEMORY_MB`, default 16384 on Azure).

Also enables `USE_AIKAR_FLAGS=true` on the itzg container (see compose files).

Override per-instance via the `env` JSON field (`JVM_OPTS`, `MODRINTH_PROJECTS`, etc.).
Set `GAME_HOST_MEMORY_MB` on the control plane to match the game VM.
