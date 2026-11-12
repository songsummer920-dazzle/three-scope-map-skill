// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated FuiSceneLoader baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';

import './FuiSceneLoader.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;

export type FuiSceneLoaderProps = {label?:string;error?:boolean;errorLabel?:string;retryable?:boolean} & EventProps<{retry:[]}>;
export default nativeMapComponent<FuiSceneLoaderProps>('FuiSceneLoader', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const props = withDefaults(scope.props<{label?:string;error?:boolean;errorLabel?:string;retryable?:boolean}>(),{label:'正在准备地图',error:false,errorLabel:'地图加载失败，请重试',retryable:false});
scope.render=()=> <><div {...scope.rootProps()} role="status" aria-live="polite" data-error={props.error} className={classNames("scene-loader",scope.rootProps().className)} style={styleObject(scope.rootProps().style)} data-v-react-fuisceneloader="">{!props.error ? <div aria-hidden="true" className={classNames("scene-loader__instrument")} data-v-react-fuisceneloader=""><i data-v-react-fuisceneloader=""></i><i data-v-react-fuisceneloader=""></i><b data-v-react-fuisceneloader=""></b></div> : null}<span data-v-react-fuisceneloader="">{props.error ? props.errorLabel : props.label}</span>{props.error && props.retryable ? <button type="button" onClick={($event?: any)=>{scope.emit('retry');}} data-v-react-fuisceneloader="">{"重新加载"}</button> : null}</div></>;
});
