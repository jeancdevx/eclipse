# Modpack runbook (~300 mods)

## Sizing

| Players | Mods | Recommended MEMORY | Azure VM |
| ------- | ---- | ------------------ | -------- |
| 1–4 | &lt;50 | 8G | D4s_v5 |
| 2–8 | 50–150 | 16G | D4s_v5 / D8s_v5 |
| 2–10 | ~300 | **24G** | **D8s_v5** (32 GB) |

Use panel presets: `light` / `standard` / `heavy`.

## JVM (Aikar-style defaults)

Eclipse sets `USE_AIKAR_FLAGS=true` via itzg when using heavy presets. Override with `JVM_OPTS` on the instance env if needed.

## Loading mods via the panel

1. Open **Instances** → select a profile → **Modpack** tab.
2. **Modrinth:** paste project URL or slug → Install. Sets `TYPE=MODRINTH` + `MODRINTH_MODPACK` in `.eclipse-runtime.env`.
3. **CurseForge:** paste project page URL → Install. Requires `CF_API_KEY` in root `.env`. Sets `TYPE=AUTO_CURSEFORGE` + `CF_PAGE_URL`.
4. **Upload:** drop a `.mrpack` or CurseForge zip; stored under `modpacks/` and pointed at `/data/modpacks/…`.
5. **JAR mods:** use the **Mods** tab to upload/delete individual `.jar` files in `mods/`.
6. Activate the instance (or Start/Restart) so compose re-reads `env_file` and itzg installs the pack.

### Client mods that crash dedicated servers

itzg re-syncs Modrinth packs on every recreate, so deleting a jar from `mods/` is temporary.

Better MC and similar packs often put client jars in the mrpack **`overrides/`** folder. Those are **not** removed by `MODRINTH_EXCLUDE_FILES` alone — you also need `MODRINTH_OVERRIDES_EXCLUSIONS` (ant patterns under `overrides/`).

Eclipse sets both by default for `missingmodschecker`, plus `MODRINTH_FORCE_SYNCHRONIZE=true`:

```bash
MODRINTH_EXCLUDE_FILES=missingmodschecker
MODRINTH_OVERRIDES_EXCLUSIONS=mods/missingmodschecker*.jar
MODRINTH_FORCE_SYNCHRONIZE=true
```

Panel → instance → **Modpack** → *Exclude files* → **Save excludes only** → **Restart**.

After restart, confirm the jar is gone from `mods/` and logs show `Excluding file from overrides: …`.

First boot of a large pack can take many minutes.

## File manager

**Files** (or instance → Files) browses `{dataPath}` with drag-and-drop upload and Monaco editing for text configs (`server.properties`, JSON, TOML, YAML, …). Paths are sandboxed (no `..`).

## Pre-flight checklist

- [ ] Instance stopped before huge mod uploads
- [ ] Backup created before switching loaders/versions
- [ ] Memory preset ≥ pack recommendation
- [ ] Disk free space (mods + world + backups staging) ≥ 40 GB for heavy packs
- [ ] Client uses same loader + pack version
- [ ] `CF_API_KEY` set when using CurseForge

## Performance tips

- Keep view distance moderate (8–10) with huge packs
- Exclude `logs/` and caches from backups (Eclipse default)
- Do not use Azure Files for live world data
- After idle deallocate, expect 1–3 minutes to rejoin while VM + container boot
