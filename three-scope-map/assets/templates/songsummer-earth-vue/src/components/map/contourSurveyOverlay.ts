// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import * as THREE from 'three';
import { mapTheme } from './mapTheme';

export type SurveyAnchor = { position: THREE.Vector3; elevation: number };

/** Screen-sized labels anchored to real contour heights, with bounded collision checks. */
export function createContourSurveyOverlay(container: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'contour-survey-overlay';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  root.setAttribute('aria-label', '主等高线海拔标注');
  container.appendChild(root);
  let entries: { anchor: SurveyAnchor; node: HTMLSpanElement }[] = [];
  const north = document.createElement('span');
  north.style.cssText = `position:absolute;right:28px;top:92px;width:42px;height:42px;border:1px solid ${mapTheme.contour.surveyMajorLine};border-radius:50%;color:${mapTheme.contour.surveyMajorLine};font:600 11px system-ui;text-align:center`;
  const needle = document.createElement('span');
  needle.textContent = '↑';
  needle.style.cssText = 'position:absolute;inset:5px 0 auto;font-size:18px;line-height:18px;transform-origin:50% 16px';
  const northLabel = document.createElement('span');
  northLabel.textContent = 'N';
  northLabel.style.cssText = 'position:absolute;inset:auto 0 3px;line-height:12px';
  north.append(needle, northLabel);
  const scale = document.createElement('span');
  scale.style.cssText = 'position:absolute;left:28px;bottom:152px;color:#dae4cc;font:11px ui-monospace,monospace;border-bottom:2px solid #b2c3a2;padding-bottom:6px;text-align:center';
  root.append(north, scale);
  return {
    set(anchors: SurveyAnchor[]) {
      entries.forEach(({ node }) => node.remove());
      entries = anchors.map(anchor => {
        const node = document.createElement('span');
        node.textContent = `${anchor.elevation} m`;
        node.style.cssText = `position:absolute;display:none;color:${mapTheme.contour.surveyMajorLine};background:${mapTheme.contour.surveyBackground};padding:2px 5px;border-radius:2px;font:600 11px/16px ui-monospace,monospace;white-space:nowrap;transform:translate(-50%,-50%)`;
        root.appendChild(node);
        return { anchor, node };
      });
    },
    update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, metresPerUnit: number,
      visible: boolean, occluded: (position: THREE.Vector3) => boolean) {
      root.hidden = !visible;
      if (!visible) return;
      const width = container.clientWidth, height = container.clientHeight;
      const accepted: { x: number; y: number }[] = [];
      const acceptedPerElevation = new Map<number, number>();
      for (const { anchor, node } of entries) {
        node.style.display = 'none';
        if (accepted.length >= 7 || (acceptedPerElevation.get(anchor.elevation) ?? 0) >= 2) continue;
        const p = anchor.position.clone().project(camera);
        const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
        if (p.z < -1 || p.z > 1 || x < 70 || x > width - 70 || y < 240 || y > height - 190
          || accepted.some(other => Math.hypot(x - other.x, y - other.y) < 150) || occluded(anchor.position)) continue;
        accepted.push({ x, y });
        acceptedPerElevation.set(anchor.elevation, (acceptedPerElevation.get(anchor.elevation) ?? 0) + 1);
        node.style.display = 'block'; node.style.left = `${x}px`; node.style.top = `${y}px`;
      }
      const centre = target.clone().project(camera);
      const n = target.clone().add(new THREE.Vector3(0, 0, -1)).project(camera);
      const angle = Math.atan2((n.x - centre.x) * width, (n.y - centre.y) * height) * 180 / Math.PI;
      needle.style.transform = `rotate(${angle}deg)`;
      // Scale is measured on a horizontal plane through the view target.
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y);
      const ray = new THREE.Raycaster();
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      ray.setFromCamera(new THREE.Vector2(-100 / width, 0), camera);
      const hitA = ray.ray.intersectPlane(plane, a);
      ray.setFromCamera(new THREE.Vector2(100 / width, 0), camera);
      const hitB = ray.ray.intersectPlane(plane, b);
      scale.hidden = !hitA || !hitB;
      if (hitA && hitB) {
        const distance = a.distanceTo(b) * metresPerUnit;
        const power = 10 ** Math.floor(Math.log10(distance));
        const nice = [5, 2, 1].map(v => v * power).find(v => v <= distance) ?? power;
        scale.style.width = `${100 * nice / distance}px`;
        scale.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
        scale.title = '视野中心水平距离';
      }
    },
    dispose() { root.remove(); },
  };
}
