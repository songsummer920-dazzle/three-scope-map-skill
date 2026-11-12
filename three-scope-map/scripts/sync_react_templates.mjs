#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Authoring only: retain the validated renderer bodies and emit native React
// source. Generated projects never install or execute the authoring compilers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilerRoot = process.argv[2];
if (!compilerRoot) throw new Error('Usage: node scripts/sync_react_templates.mjs <installed-vue-template-root>');
const require = createRequire(path.resolve(compilerRoot, 'package.json'));
const ts = require('typescript');
const { parse, compileStyle } = require('@vue/compiler-sfc');
const { baseParse } = require('@vue/compiler-dom');
const printer = ts.createPrinter();
const attribution = "// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1\n// Copyright (c) 2026 宋夏天Dazzle\n// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天\n// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill\n";
const cssAttribution = "/*\n * SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1\n * Copyright (c) 2026 宋夏天Dazzle\n * 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天\n * Source: https://github.com/songsummer920-dazzle/three-scope-map-skill\n */\n";
const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const eventName = value => 'on' + camel(value)[0].toUpperCase() + camel(value).slice(1);
const stringify = JSON.stringify;

function convert(source, name, destination) {
  const { descriptor, errors } = parse(source);
  if (errors.length) throw errors[0];
  const code = descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(name + '.ts', code, ts.ScriptTarget.Latest, true);
  const imports = [], types = [], body = [], refs = new Set(), propNames = new Set();
  let propsType = '{}', emitsType = '{}', hasProps = false;
  function findMacros(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'defineProps') {
      propsType = node.typeArguments[0].getText(ast);
      for (const member of node.typeArguments[0].members ?? []) if (member.name) propNames.add(member.name.text);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'defineEmits') emitsType = node.typeArguments[0].getText(ast);
    ts.forEachChild(node, findMacros);
  }
  findMacros(ast);
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier.text === 'vue') continue;
      imports.push(node.getFullText(ast).trim().replaceAll('.vue', '').replaceAll("'@lucide/vue'", "'lucide-react'"));
    } else if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) types.push(node.getText(ast));
    else {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (declaration.name.getText(ast) === 'props') hasProps = true;
          if (declaration.initializer && ts.isCallExpression(declaration.initializer)
            && ['ref', 'shallowRef', 'computed'].includes(declaration.initializer.expression.getText(ast))) refs.add(declaration.name.getText(ast));
        }
      }
      let text = node.getFullText(ast).trim();
      if (/^defineEmits[<(]/.test(text)) continue;
      if (/^withDefaults\(defineProps/.test(text)) { text = 'const props = ' + text; hasProps = true; }
      text = text.replace(/defineProps(?=[<(])/g, 'scope.props').replace(/defineExpose(?=\()/g, 'scope.expose')
        .replace(/defineEmits<[\s\S]*?>\(\)/g, 'scope.emit').replaceAll('.vue', '');
      body.push(text);
    }
  }
  if (!hasProps && propsType !== '{}') throw new Error('Unbound props: ' + name);
  const template = baseParse(descriptor.template.content);
  function expression(value, locals = new Set(), statement = false) {
    value = value.replaceAll('$emit', 'scope.emit');
    const parsed = ts.createSourceFile('expression.ts', statement ? value : `const __value = (${value});`, ts.ScriptTarget.Latest, true);
    const result = ts.transform(parsed, [context => {
      const visit = node => {
        if (ts.isShorthandPropertyAssignment(node) && refs.has(node.name.text) && !locals.has(node.name.text))
          return ts.factory.createPropertyAssignment(node.name, ts.factory.createPropertyAccessExpression(node.name, 'value'));
        if (ts.isIdentifier(node) && !locals.has(node.text) && node.text !== 'props') {
          const parent = node.parent;
          const property = (ts.isPropertyAccessExpression(parent) && parent.name === node)
            || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
            || ts.isPropertySignature(parent);
          if (!property && refs.has(node.text)) return ts.factory.createPropertyAccessExpression(node, 'value');
          if (!property && propNames.has(node.text)) return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('props'), node);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }]);
    const transformed = result.transformed[0];
    const output = statement ? printer.printFile(transformed).trim() : printer.printNode(ts.EmitHint.Expression, transformed.statements[0].declarationList.declarations[0].initializer, transformed).slice(1, -1);
    result.dispose(); return output;
  }
  const directive = (node, kind) => node.props?.find(p => p.type === 7 && p.name === kind);
  function children(nodes, locals) {
    const filtered = nodes.filter(node => node.type !== 3 && (node.type !== 2 || node.content.trim()));
    let output = '';
    for (let i = 0; i < filtered.length; i++) {
      const node = filtered[i], condition = directive(node, 'if');
      if (condition) {
        let value = `${expression(condition.exp.content, locals)} ? ${element(node, locals)} : `;
        while (i + 1 < filtered.length && (directive(filtered[i + 1], 'else-if') || directive(filtered[i + 1], 'else'))) {
          const next = filtered[++i], elseif = directive(next, 'else-if');
          if (elseif) value += `${expression(elseif.exp.content, locals)} ? ${element(next, locals)} : `;
          else { value += element(next, locals); break; }
        }
        if (value.endsWith(': ')) value += 'null';
        output += `{${value}}`;
      } else if (node.type === 1) output += element(node, locals);
      else if (node.type === 5) output += `{${expression(node.content.content, locals)}}`;
      else if (node.type === 2) output += `{${stringify(node.content)}}`;
      else throw new Error('Unsupported template node ' + node.type);
    }
    return output;
  }
  const scopeId = 'data-v-react-' + name.toLowerCase();
  function element(node, locals, skipFor = false) {
    const loop = directive(node, 'for');
    if (loop && !skipFor) {
      const match = loop.exp.content.match(/^\s*(?:\(([^)]+)\)|([^\s]+))\s+(?:in|of)\s+([\s\S]+)$/);
      if (!match) throw new Error('Unsupported loop ' + loop.exp.content);
      const aliases = (match[1] ?? match[2]).split(',').map(v => v.trim()), nested = new Set([...locals, ...aliases]);
      return `{list(${expression(match[3], locals)}).map((${aliases.join(',')}) => (${element(node, nested, true)}))}`;
    }
    const component = /^[A-Z]/.test(node.tag), tag = node.tag === 'template' ? 'React.Fragment' : node.tag;
    const attrs = [], classes = [], styles = [], events = new Map();
    let key;
    for (const prop of node.props) {
      if (prop.type === 6) {
        if (prop.name === 'class') classes.push(stringify(prop.value?.content ?? ''));
        else if (prop.name === 'ref') attrs.push(`ref={scope.bind(${prop.value.content})}`);
        else if (prop.name === 'key') key = stringify(prop.value.content);
        else attrs.push(`${prop.name === 'for' ? 'htmlFor' : prop.name.startsWith('aria-') || prop.name.startsWith('data-') ? prop.name : camel(prop.name)}=${prop.value ? stringify(prop.value.content) : '{true}'}`);
      } else if (prop.name === 'bind') {
        const attribute = prop.arg.content, value = expression(prop.exp.content, locals);
        if (attribute === 'class') classes.push(value);
        else if (attribute === 'style') styles.push(value);
        else if (attribute === 'key') key = value;
        else attrs.push(`${attribute.startsWith('aria-') || attribute.startsWith('data-') ? attribute : camel(attribute)}={${node.tag === 'option' && attribute === 'value' && value === 'undefined' ? "''" : value}}`);
      } else if (prop.name === 'show') styles.push(`{display:(${expression(prop.exp.content, locals)}) ? undefined : 'none'}`);
      else if (prop.name === 'on') {
        const handler = expression(prop.exp.content, new Set([...locals, '$event']), true);
        const direct = /^[\w$.?]+$/.test(prop.exp.content);
        const event = component ? eventName(prop.arg.content) : ({input:'onChange',pointerdown:'onPointerDown',pointermove:'onPointerMove',pointerup:'onPointerUp',pointercancel:'onPointerCancel',keydown:'onKeyDown',keyup:'onKeyUp',mousedown:'onMouseDown',mouseup:'onMouseUp',mousemove:'onMouseMove'}[prop.arg.content] ?? eventName(prop.arg.content));
        events.set(event, (events.get(event) ?? '') + (prop.modifiers.some(m => (m.content ?? m) === 'stop') ? '$event.stopPropagation();' : '') + (direct ? `invoke(${handler.replace(/;$/, '')},$event);` : handler));
      } else if (prop.name === 'model') {
        attrs.push(`value={${expression(prop.exp.content, locals)} ?? ''}`);
        events.set('onChange', `${expression(prop.exp.content, locals)}=$event.target.value===''?undefined:$event.target.value;` + (events.get('onChange') ?? ''));
      } else if (!['if', 'else-if', 'else', 'for'].includes(prop.name)) throw new Error('Unsupported directive ' + prop.name);
    }
    if (key) attrs.push(`key={${key}}`);
    for (const [event, handler] of events) attrs.push(`${event}={($event?: any)=>{${handler}}}`);
    const isRoot = template.children.filter(n => n.type === 1).includes(node);
    if (tag !== 'React.Fragment') {
      if (isRoot) { attrs.unshift('{...scope.rootProps()}'); classes.push('scope.rootProps().className'); styles.push('scope.rootProps().style'); }
      if (classes.length) attrs.push(`className={classNames(${classes.join(',')})}`);
      if (styles.length) attrs.push(`style={styleObject(${styles.join(',')})}`);
      attrs.push(`${scopeId}=""`);
    }
    const inner = children(node.children, locals);
    return `<${tag} ${attrs.join(' ')}>${inner}</${tag}>`;
  }
  const jsx = children(template.children, new Set());
  const runtime = './' + (destination.includes('/components/map/') ? '' : 'components/map/') + 'mapRuntime';
  const output = `${attribution}// Native React host; the Three.js renderer body is shared with the validated ${name} baseline.\nimport React from 'react';\nimport { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from '${runtime}';\n${imports.join('\n')}\nimport './${name}.css';\nconst list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;\n${types.join('\n')}\nexport type ${name}Props = ${propsType} & EventProps<${emitsType}>;\nexport default nativeMapComponent<${name}Props>('${name}', scope => {\nconst {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;\nconst shallowRef=ref,useId=()=>scope.id;\n${body.join('\n')}\nscope.render=()=> <>${jsx}</>;\n});\n`;
  const styles = descriptor.styles.map(style => compileStyle({ source: style.content, filename: name + '.css', id: scopeId, scoped: style.scoped }).code).join('\n');
  return { output, styles };
}

const baselines = {};
for (const [preset, templateName] of [['fui', 'fui-earth-vue'], ['classic', 'songsummer-earth-vue']]) {
  const templateRoot = path.join(root, 'assets/templates', templateName);
  const target = path.join(root, 'assets/react', preset);
  baselines[preset] = {};
  for (const entry of await fs.readdir(path.join(templateRoot, 'src/components/map'))) {
    if (!entry.endsWith('.vue')) continue;
    const name = entry.slice(0, -4), relative = 'src/components/map/' + name;
    const source = await fs.readFile(path.join(templateRoot, relative + '.vue'), 'utf8');
    baselines[preset][relative + '.vue'] = createHash('sha256').update(source).digest('hex');
    const { output, styles } = convert(source, name, relative);
    await fs.mkdir(path.join(target, 'src/components/map'), { recursive: true });
    await fs.writeFile(path.join(target, relative + '.tsx'), output);
    await fs.writeFile(path.join(target, relative + '.css'), cssAttribution + styles);
  }
  const app = await fs.readFile(path.join(templateRoot, 'src/App.vue'), 'utf8');
  baselines[preset]['src/App.vue'] = createHash('sha256').update(app).digest('hex');
  const { output, styles } = convert(app, 'App', 'src/App');
  await fs.writeFile(path.join(target, 'src/App.tsx'), output);
  await fs.writeFile(path.join(target, 'src/App.css'), cssAttribution + styles);
  console.log(`Generated native React ${preset} components`);
}
await fs.writeFile(path.join(root, 'assets/react/source-baselines.json'), JSON.stringify(baselines,null,2)+'\n');
