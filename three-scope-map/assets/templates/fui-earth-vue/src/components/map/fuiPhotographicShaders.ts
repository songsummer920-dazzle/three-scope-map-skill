// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Exact photographic optical functions recovered from the preserved production
// bundle (SHA-256 88290e33ce24e8c5b51ec99c830fe50c542c83387beee5cb0e70abffe9c9331d).
// World keeps the current shared-photograph polar input and gray enhancement
// gate. World/China explicitly retain the modern ribbon/honeycomb scan paths;
// outside those scan ranges their recovered optical radiance remains intact.
// Atmosphere retains its original recovered main body.
// The host supplies the existing uniform, varying and geographic helper scope.

export const photographicWorldMain = /* glsl */ `
  void fuiPhotographicWorld() {
    float surfaceReveal = smoothstep(0.0, 0.42, uIntroReveal);
    float gridReveal = smoothstep(0.28, 0.78, uIntroReveal);
    float minorGrid = max(gridLine(vUv.x, 72.0), gridLine(vUv.y, 36.0));
    float majorGrid = max(gridLine(vUv.x, 36.0), gridLine(vUv.y, 18.0));
    float grid = minorGrid * 0.56 + majorGrid * 0.22;
    float intersectionDot = gridDot(vUv, vec2(72.0, 36.0));
    vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    tangentNormal.xy *= 0.68;
    vec3 relief = texture2D(uReliefMap, vUv).rgb;
    if (uSkinReference > 0.5) {
      vec2 slope = (relief.rg * 2.0 - 1.0) * 0.64;
      tangentNormal = vec3(slope, sqrt(max(1.0 - dot(slope, slope), 0.025)));
    }
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    vec3 lightDirection = normalize(uLightDirection);
    if (uSkinReference > 0.5) lightDirection = normalize(vec3(-0.79, 0.55, 0.22));
    vec3 viewDirection = normalize(vViewDirection);
    float gridVisibility = .18*smoothstep(.08,.62,max(dot(normalize(vWorldRadial),viewDirection),0.0));
    float lightFacing = dot(terrainNormal, lightDirection);
    float wrappedLight = smoothstep(-0.34, 0.74, lightFacing);
    float nightSide = 1.0 - smoothstep(-0.18, 0.42, lightFacing);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0), 2.65);

    vec3 daySurface = texture2D(uPhotographicMap, vUv).rgb;
    float surfaceLuma = min(dot(daySurface, vec3(0.299, 0.587, 0.114)), 0.68);
    vec3 themedDaySurface = mix(
      daySurface,
      vec3(surfaceLuma),
      uSurfaceRecolorAmount
    );
    vec3 earthTint = uSurfaceTint * surfaceLuma;
    vec3 gradedSurface = mix(themedDaySurface, earthTint, 0.86) * uEarthGrade;
    float polarLatitude = smoothstep(0.67, 0.94, abs(vUv.y * 2.0 - 1.0));
    float polarIce = polarLatitude * smoothstep(0.3, 0.62, surfaceLuma);
    // The reference uses the polar cap as the main cool-white light catcher.
    // Preserve texture detail while lifting it into a desaturated blue-grey.
    vec3 polarTone = mix(vec3(surfaceLuma * 0.18), uTopLightColor * 0.64, 0.55);
    gradedSurface = mix(gradedSurface, polarTone, polarIce * 0.78);
    // Reference-matched vertical illumination: cool steel-blue at the upper
    // hemisphere, blue-grey through the middle, navy-black toward the bottom.
    float verticalPosition = clamp(vWorldRadial.y * 0.5 + 0.5, 0.0, 1.0);
    float verticalExposure = mix(
      0.78,
      1.34,
      smoothstep(0.08, 0.94, verticalPosition)
    );
    vec3 verticalFloor = mix(
      uBottomShadeColor,
      uMidToneColor,
      smoothstep(0.06, 0.56, verticalPosition)
    );
    verticalFloor = mix(
      verticalFloor,
      uTopLightColor,
      smoothstep(0.56, 0.96, verticalPosition)
    );
    vec3 color = gradedSurface * (0.78 + wrappedLight * 1.22);
    color *= mix(1.0, 0.66, polarLatitude);
    color *= verticalExposure;
    vec3 liftedFloor = max(color, verticalFloor * (0.72 + surfaceLuma * 0.18));
    float floorInfluence = mix(
      0.18,
      0.38,
      smoothstep(0.34, 0.96, verticalPosition)
    );
    color = mix(color, liftedFloor, floorInfluence);
    float satelliteDetail = clamp((surfaceLuma - 0.32) * 0.24, -0.055, 0.075);
    color *= 1.0 + satelliteDetail;

    float oceanMask = texture2D(uSpecularMap, vUv).r;
    if (uSkinReference > 0.5) {
      // Real BMNG satellite albedo carries geographic detail. DEM normals
      // only modulate diffuse light; continents are not polished metal.
      vec3 radial = normalize(vWorldRadial);
      vec3 photograph = texture2D(uPhotographicMap, vUv).rgb;
      float photoLuma = dot(photograph, vec3(0.299, 0.587, 0.114));
      float land = 1.0 - smoothstep(0.12, 0.75, oceanMask);
      float macroSun = max(dot(radial, lightDirection), 0.0);
      float terrainSun = max(dot(terrainNormal, lightDirection), 0.0);
      float diffuse = 0.025 + pow(macroSun, 1.45) * 0.88;
      float reliefLight = clamp(terrainSun - macroSun, -0.25, 0.25);
      float groundDetail = 0.055 + pow(max(photoLuma, 0.0001), 0.55) * 0.58;
      vec3 landColor = mix(uSurfaceTint, uTopLightColor, 0.28)
        * groundDetail * max(diffuse + reliefLight * 0.8, 0.018);
      float ridgeFacing = max(dot(tangentNormal.xy, normalize(vec2(-0.68, 0.74))), 0.0);
      landColor += uTopLightColor * (pow(ridgeFacing, 0.9) * (0.20 + macroSun * 0.26)
        + max(reliefLight, 0.0) * (0.16 + relief.b * 0.30));
      landColor *= 1.0 - max(-reliefLight, 0.0) * 1.2;
      // Deep water still contains a little scattered skylight on the day side.
      vec3 seaColor = uBottomShadeColor * (0.10 + macroSun * uSkinOceanBase);
      float hemisphereGrade = mix(0.20, 1.0, smoothstep(-0.80, 0.55, radial.y));
      color = mix(seaColor, landColor * uSkinWorldGain, land) * hemisphereGrade;
      float ice = polarLatitude * smoothstep(0.30, 0.62, surfaceLuma);
      // Shared cool-gray ice albedo, with satellite texture retained. Avoid
      // the former near-white floor and gain that bleached the whole cap.
      float iceAlbedo = mix(.72,1.0,smoothstep(.30,.68,surfaceLuma));
      vec3 iceColor = uSkinPolarTint * iceAlbedo
        * (0.15 + macroSun * 0.45) * uSkinPolarGain;
      color = mix(color, iceColor * hemisphereGrade, ice*uPolarEnhancement);
      // MODIS clouds remain a faint independent optical layer, with a small
      // displaced shadow. Keep the administrative China overlay unobscured.
      float cloud = texture2D(uCloudMap, vUv).r;
      float cloudShadow = texture2D(uCloudMap, vUv + vec2(0.0015, -0.001)).r;
      float chinaCloudMask = 1.0 - smoothstep(0.05, 0.45, texture2D(uChinaMask, vUv).r);
      float cloudOpacity = smoothstep(0.19, 0.88, cloud) * chinaCloudMask;
      color *= 1.0 - cloudShadow * land * 0.16 * chinaCloudMask;
      color = mix(color, uTopLightColor * (0.04 + macroSun * 0.25), cloudOpacity * 0.28);
      // A broad, low energy atmospheric veil lies inside the optical limb.
      float aerial = pow(1.0 - max(dot(radial, viewDirection), 0.0), 3.0);
      color += uSkinRimColor * aerial * (0.012 + macroSun * 0.065);
      color += uBottomShadeColor * pow(aerial, 0.45) * 0.45;
    }
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float oceanHighlight = pow(max(dot(terrainNormal, halfDirection), 0.0), uSkinOceanShininess) * oceanMask;
    color *= 1.0 - oceanMask * uSkinOceanDarken;
    color += uOceanHighlightColor * oceanHighlight * (0.08 + wrappedLight * 0.43) * uSkinOceanReflection;

    vec3 nightTexture = texture2D(uNightMap, vUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);
    float cityPhase = dot(floor(vUv * vec2(720.0, 360.0)), vec2(12.9898, 78.233));
    float naturalTwinkle = 0.97 + sin(uTime * 0.82 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.16)
      * (mix(0.16, 0.34, uSkinReference) + nightSide * 0.72) * naturalTwinkle * uSkinCityGain;

    float chinaMask = texture2D(uChinaMask, vUv).r;
    float chinaCore = smoothstep(0.82, 0.985, chinaMask);
    float contactShadow = smoothstep(0.025, 0.78, chinaMask) * (1.0 - chinaCore);
    float chinaFocusHalo = smoothstep(0.055, 0.68, chinaMask)
      * (1.0 - smoothstep(0.76, 0.985, chinaMask));
    color *= 1.0 - contactShadow * 0.46 * uChinaContact;
    color += uChinaFocusColor * chinaFocusHalo * uChinaFocus * 0.2;
    vec3 sweepAxis = normalize(uSweepAxis);
    float sweepPosition = dot(normalize(vWorldRadial), sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDistance = sweepPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDistance / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDistance / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDistance, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDistance);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    color += uGridColor * grid * (0.04 + wrappedLight * 0.036)
      * gridReveal * uGridBreath * gridVisibility;
    color += uGridDotColor * intersectionDot
      * (0.052 + wrappedLight * 0.042) * gridReveal * uGridBreath * gridVisibility;
    if (uHoneycombMode > .5) {
      vec3 hex = honeycombScan(vUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress);
      float facing = pow(max(dot(normalize(vWorldRadial),viewDirection),0.0),.35);
      color += uHoneycombColor*(hex.x*1.45+hex.y)*facing*uSweepEnergy*uSkinScanGain;
      color *= 1.0+hex.y*.18*uSweepEnergy;
    } else if (uSkinReference > .5) {
      color = applyRibbonScan(color,vUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress,gridReveal,viewDirection);
      // Original 2.0 sweep emission on the existing geographic grid. The
      // raised China face keeps terrain lighting without a second wire mesh.
      float gridSweep = sweepBand * uSweepGridStrength * uSweepEnergy;
      color += uGridColor * grid * gridSweep * 0.12 * gridReveal;
      color += uGridDotSweepColor * intersectionDot
        * gridSweep * 0.16 * gridReveal;
    } else {
    float surfaceSweep = sweepBand * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    float gridSweep = sweepBand * uSweepGridStrength * uSweepEnergy;
    float surfaceLightResponse = 0.72
      + max(dot(terrainNormal, sweepAxis), 0.0) * 0.28;
    color *= 1.0 + surfaceSweep * surfaceLightResponse
      * (0.08 + wrappedLight * 0.05);
    color += gradedSurface * surfaceSweep * 0.045;
    color += uSweepSurfaceColor
      * surfaceSweep * surfaceLightResponse * 0.16;
    float sweepCoreEnergy = sweepCore * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    color += uSweepSurfaceColor * sweepCoreEnergy
      * (0.13 + surfaceLightResponse * 0.11);
    color += uGridColor * grid * gridSweep * 0.12 * gridReveal;
    color += uGridDotSweepColor * intersectionDot
      * gridSweep * 0.16 * gridReveal;
    color += uGridDotSweepColor * grid
      * sweepCoreEnergy * 0.11 * gridReveal;
    color += uGridDotSweepColor * intersectionDot
      * sweepCoreEnergy * 0.24 * gridReveal;
    }
    color += uGridColor * fresnel * mix(0.018, 0.1, wrappedLight);
    float edge = 1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0);
    float rimLight = pow(max(dot(normalize(vWorldRadial), normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 2.4);
    color += uSkinRimColor * pow(edge, 9.0) * rimLight * uSkinEdgeGain * 0.18;
    color += uSkinRimColor * pow(edge, 24.0) * min(uSkinEdgeGain, 1.0) * 0.03;
    float keyHotspot = pow(max(dot(normalize(vWorldRadial), normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 16.0);
    color += mix(uSkinRimColor, uSkinRimCore, 0.52) * pow(edge, 14.0) * rimLight * uSkinEdgeGain * 6.0 * (0.35 + keyHotspot * 2.0);
    color *= mix(0.12, 1.0, surfaceReveal);
    float alpha = (0.985 + grid * 0.01 + fresnel * 0.012)
      * uFade * surfaceReveal;
    gl_FragColor = vec4(color, alpha);
  }
`;

export const photographicChinaMain = /* glsl */ `
  void fuiPhotographicChina() {
    float breath = 0.5 + 0.5 * sin(uTime * 2.0);
    float coarse = noise3(vPosition * 34.0);
    float fine = noise3(vPosition * 96.0);
    float grain = coarse * 0.68 + fine * 0.32;
    vec2 demUv = chinaDemUv(vGeoUv);
    vec3 tangentNormal = texture2D(uNormalMap, demUv).rgb * 2.0 - 1.0;
    float elevation = vElevation;
    if (uSkinReference > 0.5) {
      vec3 relief = texture2D(uReliefMap, vGeoUv).rgb;
      vec2 slope = (relief.rg * 2.0 - 1.0) * 0.86;
      tangentNormal = vec3(slope, sqrt(max(1.0 - dot(slope, slope), 0.025)));
      elevation = relief.b;
    }
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    float lightFacing = dot(terrainNormal, normalize(uLightDirection));
    float sun = smoothstep(-0.18, 0.82, lightFacing);
    float slopeLight = dot(tangentNormal.xy, normalize(vec2(-0.68, 0.74)));
    float directional = clamp(0.38 + sun * 0.64 + slopeLight * 0.18, 0.26, 1.08);
    if (uSkinReference > 0.5) {
      directional = clamp(0.18 + sun * 0.76 + slopeLight * 0.43, 0.08, 1.14);
    }

    vec2 reliefStep = vec2(0.0027, 0.0048);
    float hEast = texture2D(uHeightMap, demUv + vec2(reliefStep.x, 0.0)).r;
    float hWest = texture2D(uHeightMap, demUv - vec2(reliefStep.x, 0.0)).r;
    float hNorth = texture2D(uHeightMap, demUv + vec2(0.0, reliefStep.y)).r;
    float hSouth = texture2D(uHeightMap, demUv - vec2(0.0, reliefStep.y)).r;
    if (uSkinReference > 0.5) {
      hEast = texture2D(uReliefMap, vGeoUv + vec2(0.0007, 0.0)).b;
      hWest = texture2D(uReliefMap, vGeoUv - vec2(0.0007, 0.0)).b;
      hNorth = texture2D(uReliefMap, vGeoUv + vec2(0.0, 0.0014)).b;
      hSouth = texture2D(uReliefMap, vGeoUv - vec2(0.0, 0.0014)).b;
    }
    float localAverage = (hEast + hWest + hNorth + hSouth) * 0.25;
    float valleyOcclusion = smoothstep(0.008, 0.085, localAverage - elevation);
    float lightHorizon = texture2D(uHeightMap, demUv + vec2(-0.0065, 0.008)).r;
    float farHorizon = texture2D(uHeightMap, demUv + vec2(-0.013, 0.016)).r;
    if (uSkinReference > 0.5) {
      lightHorizon = texture2D(uReliefMap, vGeoUv + vec2(-0.0015, 0.002)).b;
      farHorizon = texture2D(uReliefMap, vGeoUv + vec2(-0.003, 0.004)).b;
    }
    float terrainShadow = max(
      smoothstep(0.01, 0.12, lightHorizon - elevation),
      smoothstep(0.018, 0.16, farHorizon - elevation) * 0.72
    );
    float steepnessOcclusion = 1.0 - smoothstep(0.15, 0.78, tangentNormal.z);
    float ridgeExposure = smoothstep(0.006, 0.075, elevation - localAverage);
    directional *= 1.0 - valleyOcclusion * 0.3 - terrainShadow * 0.36 - steepnessOcclusion * 0.1;
    directional = pow(max(directional, mix(0.2, 0.08, uSkinReference)), uSkinReliefContrast);

    vec3 daySurface = texture2D(uDayMap, vGeoUv).rgb;
    if (uSkinReference > 0.5) daySurface = texture2D(uPhotographicMap, vGeoUv).rgb;
    float rawLuma = dot(daySurface, vec3(0.299, 0.587, 0.114));
    float surfaceLuma = pow(min(rawLuma, 0.64), 1.34);
    vec3 themedDaySurface = mix(
      daySurface,
      vec3(rawLuma),
      uSurfaceRecolorAmount
    );
    float longitude = vGeoUv.x * 360.0 - 180.0;
    float latitude = vGeoUv.y * 180.0 - 90.0;
    float westernHighland = (1.0 - smoothstep(101.0, 113.0, longitude))
      * smoothstep(0.44, 0.78, elevation);
    float northernDryland = (1.0 - smoothstep(108.0, 118.0, longitude))
      * smoothstep(34.0, 42.0, latitude)
      * (1.0 - westernHighland * 0.62);
    float easternPlain = smoothstep(103.0, 118.0, longitude)
      * (1.0 - smoothstep(39.0, 46.0, latitude));
    float northeastForest = smoothstep(116.0, 126.0, longitude)
      * smoothstep(38.0, 47.0, latitude);
    float southernForest = smoothstep(102.0, 116.0, longitude)
      * (1.0 - smoothstep(29.0, 35.0, latitude));

    vec3 plainTone = uPlainTone * surfaceLuma;
    vec3 plateauTone = uPlateauTone * surfaceLuma;
    vec3 drylandTone = uDrylandTone * surfaceLuma;
    vec3 forestTone = uForestTone * surfaceLuma;
    vec3 northeastTone = uNortheastTone * surfaceLuma;
    vec3 earthTone = plainTone;
    earthTone = mix(earthTone, plateauTone, westernHighland * 0.88);
    earthTone = mix(earthTone, drylandTone, northernDryland * 0.68);
    earthTone = mix(earthTone, forestTone, max(easternPlain * 0.52, southernForest * 0.76));
    earthTone = mix(earthTone, northeastTone, northeastForest * 0.72);
    vec3 surfaceGrade = mix(
      vec3(0.62, 0.8, 0.43),
      vec3(0.48),
      uSurfaceRecolorAmount
    );
    vec3 albedo = mix(themedDaySurface, earthTone, 0.68) * surfaceGrade;
    albedo = mix(albedo, uColor * surfaceLuma * 1.25, uSkinAlbedoTint);
    albedo *= 0.9 + grain * 0.1;
    vec3 highlandGrade = mix(
      vec3(1.03, 1.1, 0.72),
      vec3(1.05),
      uSurfaceRecolorAmount
    );
    albedo = mix(
      albedo,
      albedo * highlandGrade,
      smoothstep(0.58, 0.92, elevation) * 0.22
    );
    albedo += uColor * uHover * 0.055;
    vec3 color = albedo * directional * 1.02;
    // Keep China readable against the surrounding globe without turning it
    // into a flat white plate. The silver blue-grey lift remains stronger on
    // the lit, ridged side so the terrain texture stays visible.
    float chinaPresence = 0.018 + sun * 0.012 + ridgeExposure * 0.014;
    color += uColor * (chinaPresence + uSkinChinaAmbient * (1.0 - valleyOcclusion * 0.3));
    color += uRidgeColor * ridgeExposure * (0.035 + sun * 0.095);
    color += uRidgeColor * uSkinReference * pow(max(slopeLight, 0.0), 1.2)
      * (0.05 + elevation * 0.35) * (1.0 - valleyOcclusion * 0.55);
    vec3 skinView = normalize(cameraPosition - vWorldRadial * 2.06);
    vec3 skinHalf = normalize(normalize(uLightDirection) + skinView);
    float skinSpecular = pow(max(dot(terrainNormal, skinHalf), 0.0), mix(140.0, 22.0, uSkinRoughness));
    color += uRidgeColor * (skinSpecular * 0.23 + ridgeExposure * pow(max(slopeLight, 0.0), 2.0) * 0.055) * uSkinMetalness;
    color *= uSkinSurfaceGain;

    vec3 sweepAxis = normalize(uSweepAxis);
    float sweepPosition = dot(normalize(vWorldRadial), sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDistance = sweepPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDistance / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDistance / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDistance, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDistance);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    float terrainSweepResponse = clamp(
      0.62 + lightFacing * 0.22 + ridgeExposure * 0.38
        - valleyOcclusion * 0.22 - terrainShadow * 0.18,
      0.32,
      1.18
    );
    if (uHoneycombMode > .5) {
      vec3 radial = normalize(vWorldRadial);
      vec3 hex = honeycombScan(vGeoUv,radial,normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress);
      float facing = pow(max(dot(radial,skinView),0.0),.35);
      color += uHoneycombColor*(hex.x*1.45+hex.y)*facing*uSweepEnergy*uSkinScanGain;
      color *= 1.0+hex.y*.18*uSweepEnergy;
    } else if (uSkinReference > .5) {
      color = applyRibbonScan(color,vGeoUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress,1.0,skinView);
    } else {
    float terrainSweep = sweepBand * uSweepSurfaceStrength
      * uSweepEnergy * terrainSweepResponse * uSkinScanGain;
    color *= 1.0 + terrainSweep * 0.14;
    color += albedo * terrainSweep * 0.04;
    color += uAccentSoft * terrainSweep * 0.16;
    color += uAccentSoft
      * ridgeExposure * sweepBand * uSweepEnergy * 0.1;
    float chinaSweepCore = sweepCore * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    color += uAccentSoft * chinaSweepCore * (0.16 + sun * 0.08);

    }

    float innerGlow = texture2D(uInnerGlowMap, vGeoUv).r;
    float glowGradient = pow(max(innerGlow, 0.0), 0.92);
    float illuminatedGlow = glowGradient * (0.46 + sun * 0.4);
    color += uInnerGlowColor * illuminatedGlow * 0.92 * uInnerGlowPulse * uSkinInnerGlowGain;

    vec3 nightTexture = texture2D(uNightMap, vGeoUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);
    float cityPhase = dot(
      floor(vGeoUv * vec2(720.0, 360.0)),
      vec2(12.9898, 78.233)
    );
    float naturalTwinkle = 0.97 + sin(uTime * 0.88 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.28)
      * 0.23 * naturalTwinkle * uSkinCityGain;
    color += uSlopeLightColor * pow(max(slopeLight, 0.0), 4.0) * (0.01 + elevation * 0.04);
    color *= mix(
      0.76,
      1.1,
      smoothstep(-0.48, 0.72, normalize(vWorldRadial).y)
    );
    color *= 0.985 + breath * 0.015;
    float surfaceColorReveal = smoothstep(0.0, 0.12, uIntroElevation);
    vec3 flatChinaTone = mix(
      themedDaySurface,
      uFlatTone * rawLuma,
      0.86
    ) * (0.5 + sun * 0.1);
    vec3 initialChinaTone = mix(flatChinaTone, color, 0.32);
    color = mix(initialChinaTone, color, surfaceColorReveal);
    float alpha = mix(0.9, 1.0, vFacing) * uFade * uIntroReveal;
    gl_FragColor = vec4(color, alpha);
  }
`;

export const photographicAtmosphereMain = /* glsl */ `
  void fuiPhotographicAtmosphere() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);
    float rim = 1.0 - abs(dot(normal, viewDirection));
    float softHalo = pow(clamp(rim, 0.0, 1.0), 2.6);
    float edgeSoftening = 1.0 - smoothstep(0.975, 1.0, rim) * 0.48;
    float lightFacing = dot(normal, normalize(uLightDirection));
    float directional = smoothstep(0.08, 0.88, lightFacing);
    float illuminatedRim = softHalo * edgeSoftening * mix(0.004, 1.0, pow(directional, 1.35));
    vec3 haloColor = mix(uColor * 0.48, uColor, directional);
    vec3 sweepAxis = normalize(uSweepAxis);
    float sphericalPosition = dot(normal, sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDelta = sphericalPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDelta / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDelta / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDelta, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDelta);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    float sweepRim = pow(clamp(rim, 0.0, 1.0), 1.5) * edgeSoftening;
    float sweepAlpha = sweepBand * sweepRim * uSweepStrength * uSweepEnergy;
    vec3 finalColor = mix(
      haloColor,
      uSweepColor,
      clamp(sweepBand * uSweepStrength * uSweepEnergy * 3.2, 0.0, 1.0)
    );
    float alpha = illuminatedRim * uIntensity + sweepAlpha;
    // The zero-intensity material is the existing radius-2.14 sweep shell.
    // Keep its classic translucent scan output; the static photographic air
    // profile below intentionally has no sweep contribution of its own.
    if (uSkinReference > 0.5 && uIntensity > 0.0) {
      // A thin scattering envelope fades to zero at its own outer silhouette.
      // The atmosphere stays chromatic; only the surface limb catches white.
      float angularLight = pow(max(dot(normal, normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 2.2);
      float viewCos = abs(dot(normal, viewDirection));
      float envelope = smoothstep(0.0, 0.10, viewCos) * exp(-viewCos * 10.0);
      float hotspot = pow(max(dot(normal, normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 16.0);
      alpha = min(envelope * (0.012 + angularLight * (0.5 + hotspot * 3.0)) * uIntensity, 0.48);
      finalColor = uColor;
    }
    gl_FragColor = vec4(finalColor, alpha * uFade);
  }
`;

