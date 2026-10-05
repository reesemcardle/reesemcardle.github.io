import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export function inspectGpx(xml, kind) {
  const document = new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(xml, "application/xml");
  if (document.documentElement.localName !== "gpx" || document.doctype) throw new Error("Expected a GPX document without a DTD.");
  const all = (node, tag) => Array.from(node.getElementsByTagNameNS("*", tag));
  let points = all(document, "trkpt").map(point => ({
    lat: point.hasAttribute("lat") ? Number(point.getAttribute("lat")) : NaN,
    lon: point.hasAttribute("lon") ? Number(point.getAttribute("lon")) : NaN,
    time: all(point,"time")[0]?.textContent.trim() || null
  }));
  if (points.length < 2) throw new Error("GPX needs at least two track points (trkpt).");
  if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error("GPX contains invalid coordinates.");
  // Some trackers write two positions in the same second. Keep the first sample;
  // do not discard all measured timing or invent a speed for a zero-time segment.
  points=points.filter((point,index,array)=>!point.time || !index || point.time!==array[index-1].time);
  if(points.length<2)throw new Error("GPX needs at least two distinct track samples.");
  const hasTiming = points.every((p,i) => Number.isFinite(Date.parse(p.time)) && (!i || Date.parse(p.time) > Date.parse(points[i-1].time)));
  if (kind === "cycling" && !hasTiming) throw new Error("Cycling GPX needs increasing timestamps for the site's speed replay. Export a recorded activity, not a planned route.");
  const track = all(document,"trk")[0];
  const name = track ? Array.from(track.childNodes).find(node=>node.localName === "name")?.textContent.trim() : "";
  // Only publish the fields used by the site, never device/account extensions.
  const clean = document.implementation.createDocument("http://www.topografix.com/GPX/1/1","gpx",null);
  const gpx = clean.documentElement;
  gpx.setAttribute("version","1.1");gpx.setAttribute("creator","Reese Field Notes");
  const element = (tag,parent,text) => { const node=clean.createElementNS(gpx.namespaceURI,tag);if(text)node.textContent=text;parent.appendChild(node);return node; };
  const trk=element("trk",gpx);if(name)element("name",trk,name);
  const segment=element("trkseg",trk);
  for(const point of points){const node=element("trkpt",segment);node.setAttribute("lat",String(point.lat));node.setAttribute("lon",String(point.lon));if(point.time)element("time",node,point.time);}
  return { name, points, hasTiming, date: hasTiming ? points[0].time : null, xml: new XMLSerializer().serializeToString(clean) + "\n" };
}
