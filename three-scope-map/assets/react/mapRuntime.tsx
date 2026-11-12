// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Framework-neutral renderer state, owned by a committed React component.
import React, { createContext, forwardRef, lazy, Suspense, useContext, useId, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

export type Ref<T> = { value: T };
export type InjectionKey<T> = symbol & { readonly __type?: T };
type Job = () => void;
let dependencyCollector: Set<Set<Job>> | undefined;
function cell<T>(initial: T): Ref<T> {
  let value = initial;
  const subscribers = new Set<Job>();
  return { get value() { dependencyCollector?.add(subscribers); return value; },
    set value(next) { if (Object.is(value, next)) return; value = next; for (const job of [...subscribers]) job(); } };
}
export function computed<T>(read: () => T): Readonly<Ref<T>> { return { get value() { return read(); } }; }
export function classNames(...values: unknown[]): string {
  return values.flatMap(value => !value ? [] : typeof value === 'string' ? [value] : Array.isArray(value)
    ? [classNames(...value)] : Object.entries(value).filter(([, active]) => active).map(([name]) => name)).join(' ');
}
export function styleObject(...values: any[]): React.CSSProperties {
  return Object.assign({}, ...values.flat(Infinity).filter(Boolean));
}
export const invoke = (handler: Function, event: any) => handler(event);
type Defaulted<T, D> = Omit<T, keyof D> & { [K in keyof T & keyof D]-?: Exclude<T[K], undefined> };
export function withDefaults<T extends object, D extends Partial<Record<keyof T, unknown>>>(props: T, defaults: D): Defaulted<T, D> {
  return new Proxy(props, { get(target, key) {
    const value = Reflect.get(target, key);
    if (value !== undefined) return value;
    const fallback = (defaults as any)[key];
    // Only array/object defaults are factories in these maintained renderers.
    return typeof fallback === 'function' ? fallback() : fallback;
  } }) as Defaulted<T, D>;
}
export const nextTick = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
export function defineAsyncComponent(load: () => Promise<{ default: React.ComponentType<any> }>) {
  const Component = lazy(load);
  return forwardRef<any, any>((props, ref) => <Suspense fallback={null}><Component {...props} ref={ref} /></Suspense>);
}
const InjectionContext = createContext<Map<symbol, unknown>>(new Map());
const emptySubscribe = () => () => {};
const emptySnapshot = () => 0;
type HostProps = { className?: string; style?: React.CSSProperties; id?: string };
export type EventProps<T> = { [K in keyof T as K extends string ? `on${Camel<K>}` : never]?: T[K] extends any[] ? (...args: T[K]) => void : never };
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${Capitalize<A>}${Camel<B>}` : Capitalize<S>;

export class MapScope {
  private input: Record<string, any>;
  private fields = new Map<PropertyKey, Ref<any>>();
  private listeners = new Set<Job>();
  private cleanups: Job[] = [];
  private mounts: Job[] = [];
  private refBindings = new WeakMap<object, (value: any) => void>();
  private revision = 0;
  private mounted = false;
  disposed = false;
  exposed: any = {};
  readonly provided: Map<symbol, unknown>;
  render: () => React.ReactNode = () => null;
  constructor(input: Record<string, any>, inherited: Map<symbol, unknown>, readonly id: string) {
    this.input = input;
    this.provided = new Map(inherited);
  }
  invalidate = () => { if (!this.disposed) { this.revision++; for (const listener of [...this.listeners]) listener(); } };
  subscribe = (listener: Job) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  ref: { <T>(value: T): Ref<T>; <T = any>(): Ref<T | undefined> } = ((...args: any[]) => {
    const state = cell(args[0]);
    // UI refs change infrequently; Three.js frame data stays outside this store.
    const self = this;
    return { get value() { return state.value; }, set value(value: any) { const before = state.value; state.value = value; if (!Object.is(before, value)) self.invalidate(); } };
  }) as MapScope['ref'];
  props = <T extends object,>(): T => new Proxy({} as T, { get: (_, key) => {
    let state = this.fields.get(key);
    if (!state) { state = cell(this.input[key as string]); this.fields.set(key, state); }
    return state.value;
  } });
  update(input: Record<string, any>) {
    const previousHost = this.rootProps();
    this.input = input;
    const nextHost = this.rootProps();
    let changed = Object.keys({...previousHost,...nextHost}).some(key => !Object.is(previousHost[key],nextHost[key]));
    for (const [key, state] of this.fields) if (!Object.is(state.value, input[key as string])) {
      changed = true; state.value = input[key as string];
    }
    if (changed) this.invalidate();
  }
  emit = (event: string, ...args: any[]) => {
    if (this.disposed) return;
    const key = 'on' + event.replace(/(^|-)(\w)/g, (_, _dash, letter) => letter.toUpperCase());
    this.input[key]?.(...args);
  };
  expose = (value: any) => { this.exposed = value; };
  provide = <T,>(key: InjectionKey<T>, value: T) => { this.provided.set(key, value); };
  inject = <T,>(key: InjectionKey<T> | symbol, fallback?: T): T => (this.provided.has(key) ? this.provided.get(key) : fallback) as T;
  onMounted = (job: Job) => { this.mounts.push(job); };
  onBeforeUnmount = (job: Job) => { this.cleanups.push(job); };
  watch = <T,>(source: Ref<T> | (() => T) | (Ref<any> | (() => any))[], callback: (value: T, previous: T) => void, options: { immediate?: boolean; flush?: string } = {}) => {
    let dependencies = new Set<Set<Job>>(), stopped = false, queued = false;
    const read = (item: any): any => typeof item === 'function' ? item() : item.value;
    const evaluate = (): T => {
      for (const subscribers of dependencies) subscribers.delete(schedule);
      dependencies = new Set();
      const previousCollector = dependencyCollector; dependencyCollector = dependencies;
      try { return (Array.isArray(source) ? source.map(read) : read(source)) as T; }
      finally { dependencyCollector = previousCollector; for (const subscribers of dependencies) subscribers.add(schedule); }
    };
    const same = (a: any, b: any) => Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((value, index) => Object.is(value, b[index])) : Object.is(a, b);
    const run = () => {
      queued = false; if (stopped || this.disposed) return;
      const value = evaluate();
      if (!same(value, previous)) { const old = previous; previous = value; callback(value, old); }
    };
    function schedule() { if (options.flush === 'sync') run(); else if (!queued) { queued = true; queueMicrotask(run); } }
    let previous = evaluate();
    if (options.immediate) callback(previous, undefined as T);
    const stop = () => { stopped = true; for (const subscribers of dependencies) subscribers.delete(schedule); dependencies.clear(); };
    this.cleanups.push(stop);
    return stop;
  };
  bind = (target: Ref<any>) => {
    let binding = this.refBindings.get(target);
    if (!binding) { binding = value => { target.value = value ?? undefined; }; this.refBindings.set(target, binding); }
    return binding;
  };
  rootProps() {
    return Object.fromEntries(Object.entries(this.input).filter(([key]) => ['className', 'style', 'id'].includes(key) || key.startsWith('data-') || key.startsWith('aria-')));
  }
  mount() { if (!this.mounted && !this.disposed) { this.mounted = true; for (const job of this.mounts) job(); } }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.listeners.clear(); this.mounts.length = 0;
  }
}

export function nativeMapComponent<P extends object>(name: string, setup: (scope: MapScope) => void) {
  const Component = forwardRef<any, P & HostProps>((input, forwardedRef) => {
    const inherited = useContext(InjectionContext), id = useId();
    const latest = useRef(input); latest.current = input;
    const [scope, setScope] = useState<MapScope>();
    // Create after commit. StrictMode's discarded renders allocate no WebGL,
    // watchers, observers, workers, or timers. Each effect owns its cleanup.
    useLayoutEffect(() => {
      const current = new MapScope(latest.current, inherited, id);
      try { setup(current); } catch (error) { current.dispose(); throw error; }
      setScope(current);
      return () => current.dispose();
    }, [inherited, id]);
    useSyncExternalStore(scope?.subscribe ?? emptySubscribe, scope?.snapshot ?? emptySnapshot, emptySnapshot);
    useLayoutEffect(() => { scope?.update(input); });
    useImperativeHandle(forwardedRef, () => scope?.exposed, [scope]);
    useLayoutEffect(() => { scope?.mount(); }, [scope]);
    if (!scope || scope.disposed) return null;
    return <InjectionContext.Provider value={scope.provided}>{scope.render()}</InjectionContext.Provider>;
  });
  Component.displayName = name;
  return Component;
}
