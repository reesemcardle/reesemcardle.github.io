import { createProjection, geoPointsToPath } from "./field-utils.mjs";

export const harborBounds = { minLat: 40.45, maxLat: 40.95, minLon: -74.3, maxLon: -73.7 };
export const harborFrame = { x: 125, y: 58, width: 1350, height: 900 };
export const harborProjection = (bounds = harborBounds, rotation = -29) => createProjection(bounds, harborFrame, rotation);

const layers = [
  ["landmass", "harborLand"], ["water", "harborWater"],
  ["land", "harborParks"], ["street", "harborRoads"], ["pier", "harborPaths"]
];

function coveragePath(data, projection) {
  const { minLon: w, maxLon: e, minLat: s, maxLat: n } = data.bounds;
  return geoPointsToPath([[w, s], [e, s], [e, n], [w, n]], true, projection);
}

export function harborPaths(data, projection) {
  return layers.map(([kind, id]) => ({
    id,
    paths: data.features.filter((feature) => feature.kind === kind).map((feature) => ({
      d: (feature.rings || [feature.points]).map((ring) => geoPointsToPath(ring, feature.closed, projection)).join(" "),
      className: `map-feature is-${kind}`
    }))
  }));
}

export function renderHarborMap(data, projection, root) {
  let clip = root.querySelector("#harborCoverage");
  if (!clip) {
    clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clip.id = "harborCoverage";
    clip.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    root.querySelector("defs").append(clip);
  }
  clip.firstChild.setAttribute("d", coveragePath(data, projection));
  for (const { id, paths } of harborPaths(data, projection)) {
    const layer = root.querySelector(`#${id}`);
    layer.setAttribute("clip-path", "url(#harborCoverage)");
    const fragment = document.createDocumentFragment();
    // Disconnected line subpaths share one style; batching avoids thousands of SVG nodes.
    const drawings = ["harborRoads", "harborPaths"].includes(id) && paths.length
      ? [{ d: paths.map((path) => path.d).join(" "), className: paths[0].className }]
      : paths;
    for (const { d, className } of drawings) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", className);
      path.setAttribute("fill-rule", "evenodd");
      fragment.append(path);
    }
    layer.replaceChildren(fragment);
  }
}

export function harborSvg(data) {
  const projection=harborProjection(data.bounds,data.rotation ?? -29);
  const colors = { harborLand: "#f3eee2", harborWater: "#d9e3df", harborParks: "#d5d7c8", harborRoads: "none", harborPaths: "none" };
  const groups = harborPaths(data, projection).map(({ id, paths }) =>
    `<g id="${id}" fill="${colors[id]}" fill-rule="evenodd" stroke="${id === "harborRoads" || id === "harborPaths" ? "#b7b1a4" : "none"}" stroke-width="0.7">${paths.map(({ d }) => `<path d="${d}"/>`).join("")}</g>`
  ).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><title>${data.name || "New York Harbor"}</title><defs><clipPath id="coverage"><path d="${coveragePath(data, projection)}"/></clipPath></defs>\n<g clip-path="url(#coverage)">${groups}</g>\n</svg>\n`;
}
