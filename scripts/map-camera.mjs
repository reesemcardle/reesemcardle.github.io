import { haversineMeters } from "./field-utils.mjs";

export function launchCenter(sails) {
  const ends = sails.flatMap(({ points }) => points.length ? [points[0], points.at(-1)] : []);
  if (!ends.length) return { lon: -74.01, lat: 40.753 };
  const cluster = ends.map((anchor) => ends.filter((point) => haversineMeters(anchor, point) < 1200))
    .sort((a, b) => b.length - a.length)[0];
  return {
    lon: cluster.reduce((sum, point) => sum + point.lon, 0) / cluster.length,
    lat: cluster.reduce((sum, point) => sum + point.lat, 0) / cluster.length
  };
}

export function fitCamera(points, aspect, padding = 0.18) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  let width = Math.max(right - left, 30) * (1 + 2 * padding);
  let height = Math.max(bottom - top, 30) * (1 + 2 * padding);
  width = Math.max(width, height * aspect);
  height = width / aspect;
  return { x: (left + right - width) / 2, y: (top + bottom - height) / 2, width, height };
}

export function unprojectMapDelta(x, y, pitch, bearing) {
  const angle=bearing*Math.PI/180;
  const flatY=y/Math.cos(pitch*Math.PI/180);
  return {x:x*Math.cos(angle)+flatY*Math.sin(angle),y:-x*Math.sin(angle)+flatY*Math.cos(angle)};
}

export function createMapCamera(svg, { worldId, layers, markerId, allowRotation = false }) {
  let frame = null;
  let current = null;
  let pitch = 0;
  let bearing = 0;
  let drag = null;
  let paintFrame = null;
  const marker = markerId ? svg.querySelector(`#${markerId}`) : null;
  const size = { width: 1, height: 1 };
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width && entry.contentRect.height) {
      size.width = entry.contentRect.width;
      size.height = entry.contentRect.height;
    }
  }).observe(svg);
  const world = document.createElementNS("http://www.w3.org/2000/svg", "g");
  world.id = worldId;
  world.append(...svg.querySelectorAll(layers));
  svg.append(world);
  const unprojectDelta = (x, y) => {
    return unprojectMapDelta(x,y,pitch,bearing);
  };
  const paint = () => {
    paintFrame = null;
    const box = current;
    svg.setAttribute("viewBox", [box.x, box.y, box.width, box.height].join(" "));
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // Orthographic pitch keeps the map and traces in the same inexpensive SVG transform.
    world.setAttribute("transform", `translate(${cx} ${cy}) scale(1 ${Math.cos(pitch * Math.PI / 180)}) rotate(${bearing}) translate(${-cx} ${-cy})`);
    svg.dataset.pitch = String(pitch);
    svg.dataset.bearing = String(bearing);
    if (marker) marker.setAttribute("r", String(4.5 * box.width / size.width));
  };
  // Coalesce high-frequency input without dropping accumulated camera movement.
  const write = (box, immediate = false) => {
    current = box;
    if (immediate) {
      cancelAnimationFrame(paintFrame);
      paint();
    } else if (paintFrame === null) {
      paintFrame = requestAnimationFrame(paint);
    }
  };
  const zoom = (factor, fx = 0.5, fy = 0.5) => {
    if (!current) return;
    cancelAnimationFrame(frame);
    const width = Math.max(40, Math.min(2400, current.width * factor));
    const height = current.height * width / current.width;
    const offset = unprojectDelta((fx - 0.5) * (current.width - width), (fy - 0.5) * (current.height - height));
    write({ x: current.x + (current.width - width) / 2 + offset.x, y: current.y + (current.height - height) / 2 + offset.y, width, height });
    svg.dataset.camera = "manual";
  };
  svg.addEventListener("pointerdown", (event) => {
    if (!current || event.button !== 0 || event.pointerType === "touch") return;
    cancelAnimationFrame(frame);
    svg.focus({ preventScroll: true });
    svg.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY };
    svg.classList.add("is-dragging");
    event.preventDefault();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY };
    if (event.shiftKey) {
      if(allowRotation)bearing=((bearing+dx*0.4+180)%360+360)%360-180;
      pitch = Math.max(0, Math.min(68, pitch - dy * 0.4));
      write(current);
    } else {
      const offset = unprojectDelta(dx * current.width / size.width, dy * current.height / size.height);
      write({ ...current, x: current.x - offset.x, y: current.y - offset.y });
    }
    svg.dataset.camera = "manual";
  });
  const endDrag = () => { drag = null; svg.classList.remove("is-dragging"); };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("lostpointercapture", endDrag);
  svg.addEventListener("wheel", (event) => {
    if (!current) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    zoom(Math.exp(Math.max(-0.4, Math.min(0.4, delta * 0.0015))), (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }, { passive: false });
  svg.addEventListener("keydown", (event) => {
    if (!current) return;
    if (["+", "=", "-"].includes(event.key)) zoom(event.key === "-" ? 1.2 : 1 / 1.2);
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      cancelAnimationFrame(frame);
      const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      const offset = unprojectDelta(dx * current.width * 0.1, dy * current.height * 0.1);
      write({ ...current, x: current.x + offset.x, y: current.y + offset.y });
      svg.dataset.camera = "manual";
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });
  return {
    stop() { cancelAnimationFrame(frame); frame = null; },
    move(target, animate = true) {
      this.stop();
      pitch = 0;
      bearing = 0;
      if (!current || !animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        write(target, true);
        return;
      }
      const from = current;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / 260, 1);
        const ease = progress * progress * (3 - 2 * progress);
        write(Object.fromEntries(Object.keys(target).map((key) => [key, from[key] + (target[key] - from[key]) * ease])), true);
        frame = progress < 1 ? requestAnimationFrame(step) : null;
      };
      frame = requestAnimationFrame(step);
    }
  };
}
