// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated App baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './components/map/mapRuntime';
import EarthChinaMap from './components/map/EarthChinaMap';
import './App.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;

export type AppProps = {} & EventProps<{}>;
export default nativeMapComponent<AppProps>('App', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;

scope.render=()=> <><main {...scope.rootProps()} className={classNames("map-page",scope.rootProps().className)} style={styleObject(scope.rootProps().style)} data-v-react-app=""><EarthChinaMap data-v-react-app=""></EarthChinaMap></main></>;
});
