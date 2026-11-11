# FUI Earth Visual Context

## Visual theme

Near-black neutral space, curved lighting and a soft atmosphere. Entity surfaces use geographically continuous relief. The named palettes are amber (bronze/champagne), glacier (deep blue/ice cyan) and alert (graphite/ember red).

## Layout

The entity composition uses 1020 × 975 bounds; original and holographic presentations use 1052 × 1080. Each fits its parent uniformly. Globe and HUD stay aligned through resize and handoff. Entity instrumentation consists of rings, scales and four equal inward cardinal marks, without crossing axes or external annotation tags.

## Components

`FuiEarth.vue` owns decorative SVG instrumentation; `EarthView.vue` owns the Three.js renderer. `fuiEarthTheme.ts` owns skin color and material roles. Scene presets pair Earth presentation with the destination map material.

## Visual structure

Entity terrain uses coherent mountain ranges and restrained highlights. Light reaches the surface and fades smoothly outside the limb. Fine HUD hairlines use major, intermediate and minor scales with sparse outer indexing. The moving grid stays readable within the sweep and fades with its soft light-band shoulders.
