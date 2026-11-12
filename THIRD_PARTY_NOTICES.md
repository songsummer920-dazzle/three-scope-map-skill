# Third-party notices and asset provenance

The custom 3.0 license covers the author's own work only. It neither relicenses
third-party code/data nor promises additional commercial or redistribution
rights to those materials. Preserve upstream notices, credits and per-asset
metadata when copying a project. Paths below are relative to the portable
`three-scope-map/` directory.

## Commercial use and redistribution

The author-owned code license does not provide commercial authorization for
third-party data, basemap services, imagery or textures. Each user or deployer
must assess the applicable upstream terms and obtain permissions required for
their own use, deployment or redistribution, including attribution, fees and
usage limits. A public download, source receipt or working example is not a
commercial license. This notice does not confirm any unresolved redistribution
rights for assets included in the bundle. Third-party permission also does not
replace the author's written permission for restricted platform resale.

## Runtime dependencies

The two complete template lockfiles identify exact versions, integrity and
transitive dependency declarations. They remain authoritative for installation;
this list does not replace any upstream license. Dependency sources are fetched
by npm; node_modules is not shipped in the Skill archive.

| Package (FUI lockfile version) | Upstream license declaration | Upstream |
| --- | --- | --- |
| three 0.176.0 | MIT | https://github.com/mrdoob/three.js/blob/dev/LICENSE |
| vue 3.5.40 | MIT | https://github.com/vuejs/core/blob/main/LICENSE |
| gsap 3.15.0 | GSAP Standard “no charge” license, not MIT | https://gsap.com/standard-license/ |
| maplibre-gl 6.3.0 | BSD-3-Clause | https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt |
| pmtiles 4.5.0 | BSD-3-Clause | https://github.com/protomaps/PMTiles/blob/main/LICENSE |
| polygon-clipping 0.15.7 | MIT | https://github.com/mfogel/polygon-clipping/blob/master/LICENSE.md |
| @lucide/vue 1.33.0 | ISC | https://github.com/lucide-icons/lucide/blob/main/LICENSE |

Verbatim license files present in the installed upstream packages used for the
reviewed build are retained under `LICENSES/third-party/`. GSAP and PMTiles declare
their terms via the upstream locations above; no different license is inferred
from this list. Dev dependencies and transitive dependencies retain the license
and copyright information in their packages and the template lockfiles.

Native React projects retain the same applicable runtime terms and additionally
use React, React DOM and Scheduler under MIT, plus Lucide React under ISC for the
FUI family. Verbatim notices are bundled in `assets/react/licenses/` and copied
to generated projects under `LICENSES/third-party/`. React projects generate a
framework-specific lockfile on their first `npm install`; retain it for later
`npm ci` installs rather than reusing a Vue lockfile.

## Photographic and geographic relief sources

`assets/templates/fui-earth-vue/src/assets/textures/map/world/earth-optical-source.json`
records the exact photograph/cloud/night-detail raster URLs, credits, processing
and hashes. Its sources credit Reto Stöckli, NASA Earth Observatory / NASA GSFC,
Robert Simmon, Joshua Stevens, Suomi NPP VIIRS and Miguel Román as applicable.
`earth-relief-source.json` in both template families records the NASA Earth
Observatory / GEBCO relief raster and credits Jesse Allen, NASA Earth Observatory,
GEBCO and the British Oceanographic Data Centre. Preserve those sidecars and the
crop/cache metadata for derived assets.

NASA's Earth science FAQ permits reuse of most of its materials, including
commercial reuse, except items with separate copyright notices; credit and
no-endorsement conditions still apply. This is not a claim that every image
hosted by NASA is unconditionally public domain. See:
https://science.nasa.gov/earth/faq/
https://www.nasa.gov/nasa-brand-center/images-and-media/

## Verified legacy Earth texture bytes

The day, normal, specular and lights textures in both template families were
verified byte-for-byte against the official Three.js `r176` examples. SHA-256 and
Git blob receipts, fixed source URLs and repository-level MIT license provenance
are retained in `LICENSES/asset-sources.json`. This establishes the exact upstream
files; it does not invent separate original-image credits or additional rights.

## Verified terrain material

The four legacy `terrain-diffuse.jpg`, `terrain-height.jpg`, `terrain-normal.jpg`
and `terrain-roughness.jpg` files in both template families match the official
Poly Haven **Rocky Terrain** 1K assets byte-for-byte. Author: Amal Kumar.
Poly Haven distributes these assets under CC0-1.0, including commercial use and
redistribution. Exact source URLs and SHA-256 receipts are retained in
`LICENSES/asset-sources.json`. Preserve this source record when copying the material.

Asset: https://polyhaven.com/a/rocky_terrain
License: https://polyhaven.com/license

## Administrative geography

- Both `src/assets/maps/world.json` files identify the dataset name
  `ne_10m_admin_0_countries`. Natural Earth states that its own vector/raster
  datasets are public domain: https://www.naturalearthdata.com/about/terms-of-use/.
  The repository's render caches retain their source/build hash metadata.
- The bundled `china.json` bytes match DataV's
  `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json` exactly. DataV's
  official map tool credits AMap and limits the data to learning/exchange use:
  https://datav.aliyun.com/portal/school/atlas/atlas_publish. Public API access
  does not establish permission for commercial use or redistribution.
- The bundled `zhejiang.json` bytes match GeoJSON.CN's version 1.6.3 endpoint
  `https://geojson.cn/api/china/1.6.3/330000.json` exactly. Its about page limits
  collected network data to learning/research: https://geojson.cn/about.
  Version 1.6+ documentation identifies Tencent API data in GCJ-02, rather than
  establishing a WGS84 source: https://geojson.cn/data/atlas/china. Preserve the
  existing copyright metadata; a free API is not a redistribution grant.
- The legacy China height and normal PNG maps still lack a verified original
  upstream license. Historical build hashes establish continuity, not permission.
  Exact source receipts and remaining unresolved rights are recorded in
  `LICENSES/asset-sources.json`.
  User-specific commercial authorization is separate from permission to include
  assets in a distributed bundle. Both must follow the applicable upstream terms;
  unresolved bundle rights remain identified in `LICENSES/asset-sources.json`.
  The author-owned platform restriction grants no additional third-party rights.

## Historical licensing

`LICENSES/GPL-3.0-or-later.txt` preserves the previous GPL text verbatim. Previously
valid GPL grants for earlier copies remain valid. Its inclusion does not dual-license this new distribution's
self-authored material under GPL. Third-party GPL-covered material, if separately
identified or added by a downstream user, continues to require its own applicable
GPL terms and cannot be relicensed by this custom author-owned grant.

Author-owned license 1.0 is archived unchanged in `LICENSES/LicenseRef-Summer-Platform-Restriction-1.0.txt`
for earlier copies. The current author-owned grant is license 1.1 in `LICENSE`;
the archival copy does not grant an additional license choice for copies supplied
under 1.1. Rights already validly obtained under earlier grants remain unaffected.
