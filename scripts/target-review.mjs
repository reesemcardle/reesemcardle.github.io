import { normalizeImpact } from "./target-records.mjs";

const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
let records = [], current = null, active = null, selected = new Set(), dirty = false, history = [], tool = "select", splitSource = null;
let view = null, gesture = null, saving = false;
const label = mark => mark.id.replace(/^impact-/, "").replace(/^pin-/, "Pin ");
const allMarks = () => current ? [...current.marks, ...current.excluded] : [];
const activeMark = () => allMarks().find(mark => mark.id === active);
const isExcluded = id => current.excluded.some(mark => mark.id === id);
function status(text, error = false) { $("saveStatus").textContent = text; $("saveStatus").classList.toggle("error", error); }
function changed() { dirty = true; $("save").disabled = saving; status("Unsaved review"); }
function remember() { history.push(structuredClone(current)); if (history.length > 100) history.shift(); }
function edit(fn) { if (!current) return; remember(); fn(); changed(); render(); }
function element(tag, attrs = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text != null) node.textContent = text;
  return node;
}
async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
function queue() {
  $("queue").replaceChildren();
  for (const record of records) {
    const button = document.createElement("button");
    button.classList.toggle("active", record.id === current?.id);
    button.textContent = record.date || record.name;
    const small = document.createElement("small");
    small.textContent = `${record.marks.length} sites / ${record.marks.filter(mark => mark.uncertain).length} flagged / ${record.reviewState === "ready" ? "Ready for revision" : record.reviewState || "Draft"}`;
    button.append(small); button.onclick = () => choose(record.id); $("queue").append(button);
  }
}
async function choose(id, force = false) {
  if (saving) return;
  if (dirty && !force && !confirm("Discard unsaved changes to this review?")) return;
  try {
    current = await request(`/api/targets/${id}`);
    selected.clear(); active = current.marks.find(mark => mark.uncertain)?.id || current.marks[0]?.id || null;
    if (active) selected.add(active);
    history = []; dirty = false; splitSource = null; setTool("select");
    $("photoImage").setAttribute("href", `/api/targets/${id}/image`);
    $("photoImage").setAttribute("width", current.width); $("photoImage").setAttribute("height", current.height);
    $("name").value = current.name; $("date").value = current.date;
    $("targetFeedback").value = current.reviewFeedback || ""; $("reviewState").value = current.reviewState || "draft";
    fit(); queue(); render(); status("Saved locally");
  } catch (error) { status(error.message, true); }
}
async function load() {
  if (saving || dirty && !confirm("Discard unsaved changes and reload?")) return;
  try {
    const id = current?.id;
    records = await request("/api/targets");
    records.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    queue(); $("empty").hidden = Boolean(records.length);
    if (records.length) await choose(records.some(record => record.id === id) ? id : records[0].id, true);
    else { status("No imported photos"); $("save").disabled = true; }
  } catch (error) { status(`Review server unavailable: ${error.message}`, true); }
}
function setTool(value) {
  tool = value; $("photo").dataset.tool = value;
  document.querySelectorAll('[name="tool"]').forEach(input => { input.checked = input.value === value; });
}
function fit() {
  if (!current) return;
  view = { x: 0, y: 0, width: current.width, height: current.height }; paintView();
}
function paintView() { $("photo").setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`); $("zoom").value = current.width / view.width; }
function point(event) {
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform($("photo").getScreenCTM().inverse());
  return { x: Math.max(0, Math.min(current.width, p.x)), y: Math.max(0, Math.min(current.height, p.y)) };
}
function markers() {
  $("markers").replaceChildren();
  if (!current) return;
  const scale = current.width / 700;
  for (const mark of allMarks()) {
    const classes = ["marker", mark.uncertain ? "flagged" : "", isExcluded(mark.id) ? "excluded" : "", selected.has(mark.id) ? "active" : ""].join(" ");
    const group = element("g", { class: classes, "data-id": mark.id });
    group.append(element("circle", { cx: mark.x, cy: mark.y, r: 7 * scale }));
    group.append(element("text", { x: mark.x + 9 * scale, y: mark.y - 8 * scale, "font-size": 11 * scale }, label(mark)));
    group.append(element("title", {}, `${label(mark)}: ${mark.feedback || mark.note || "Impact"}`));
    $("markers").append(group);
  }
}
function render() {
  if (!current) return;
  const mark = activeMark();
  $("save").disabled = !dirty || saving;
  $("undo").disabled = !history.length || saving;
  $("selectedTitle").textContent = mark ? `Mark ${label(mark)}${isExcluded(mark.id) ? " (excluded)" : ""}` : "No mark selected";
  $("observation").textContent = mark?.note || "";
  $("markDetails").disabled = !mark || saving;
  $("markFeedback").value = mark?.feedback || "";
  $("observedCount").value = mark?.observedCount ?? "";
  $("exclude").textContent = mark && isExcluded(mark.id) ? "Restore" : "Exclude";
  $("split").disabled = !mark || isExcluded(mark.id);
  $("confirm").disabled = !mark || isExcluded(mark.id);
  $("merge").disabled = saving || [...selected].filter(id => !isExcluded(id)).length < 2;
  $("counts").textContent = `${current.marks.length} sites / ${current.marks.filter(m => m.uncertain).length} flagged / ${current.excluded.length} excluded`;
  const index = records.findIndex(record => record.id === current.id);
  $("previous").disabled = index <= 0; $("next").disabled = index >= records.length - 1;
  const list = $("markList"), scroll = list.scrollTop; list.replaceChildren();
  let ordered = allMarks();
  if ($("flaggedOnly").checked) ordered = ordered.sort((a, b) => Number(b.uncertain) - Number(a.uncertain));
  for (const m of ordered) {
    const row = document.createElement("div"); row.className = `mark-row${selected.has(m.id) ? " active" : ""}${isExcluded(m.id) ? " excluded" : ""}`;
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = selected.has(m.id); check.setAttribute("aria-label", `Select mark ${label(m)}`);
    check.onchange = () => { if (check.checked) { selected.add(m.id); active = m.id; } else selected.delete(m.id); render(); };
    const button = document.createElement("button"); button.textContent = `Mark ${label(m)}`; button.onclick = () => { selected = new Set([m.id]); active = m.id; render(); };
    const state = document.createElement("small"); state.textContent = isExcluded(m.id) ? "Excluded" : m.uncertain ? "Flagged" : "Impact";
    row.append(check, button, state); list.append(row);
  }
  list.scrollTop = scroll; markers(); preview();
}
function preview() {
  const svg = $("preview"); svg.replaceChildren();
  ["#fff", "#fff", "#303434", "#303434", "#309cd0", "#309cd0", "#ed4939", "#ed4939", "#ffdc36", "#ffdc36"].forEach((fill, i) => svg.append(element("circle", { r: 1 - i / 10, fill, stroke: "#777", "stroke-width": .003 })));
  if (!current.calibration) return;
  for (const mark of current.marks) {
    const p = normalizeImpact(mark, current.calibration);
    svg.append(element("circle", { cx: p.x, cy: -p.y, r: selected.has(mark.id) ? .023 : .014, fill: mark.uncertain ? "#b32979" : "#075946", stroke: "white", "stroke-width": .004 }));
  }
}
function newMark(p, feedback = "") {
  const maximum = Math.max(0, ...allMarks().map(mark => Number(mark.id.match(/^impact-(\d+)$/)?.[1]) || 0));
  const mark = { id: `impact-${maximum + 1}`, ...p, uncertain: false, note: "Added during review", feedback };
  current.marks.push(mark); active = mark.id; selected = new Set([mark.id]);
}
$("photo").addEventListener("pointerdown", event => {
  if (!current || saving || event.button !== 0) return;
  const id = event.target.closest("[data-id]")?.dataset.id;
  if (tool === "pan") {
    const matrix = $("photo").getScreenCTM();
    gesture = { kind: "pan", clientX: event.clientX, clientY: event.clientY, view: { ...view }, scaleX: matrix.a, scaleY: matrix.d };
  } else if (tool === "add" || tool === "split") {
    const p = point(event);
    edit(() => {
      let knownPair = false;
      if (splitSource) {
        const source = allMarks().find(mark => mark.id === splitSource);
        knownPair = source.observedCount === 2;
        source.observedCount = knownPair ? 1 : null;
        source.uncertain = false;
        source.feedback = `${source.feedback || ""}\nSplit into separate locations during review.`.trim();
      }
      newMark(p);
      if (knownPair) activeMark().observedCount = 1;
    });
    splitSource = null; setTool("select"); return;
  } else if (id) {
    selected = new Set([id]); active = id; render();
    gesture = { kind: "mark", id, origin: point(event), saved: false };
  } else return;
  $("photo").setPointerCapture(event.pointerId); event.preventDefault();
});
$("photo").addEventListener("pointermove", event => {
  if (!gesture || !current) return;
  if (gesture.kind === "pan") {
    view = { ...gesture.view, x: gesture.view.x - (event.clientX - gesture.clientX) / gesture.scaleX, y: gesture.view.y - (event.clientY - gesture.clientY) / gesture.scaleY }; paintView(); return;
  }
  const p = point(event);
  if (!gesture.saved && Math.hypot(p.x - gesture.origin.x, p.y - gesture.origin.y) < 2) return;
  if (!gesture.saved) { remember(); gesture.saved = true; }
  Object.assign(allMarks().find(mark => mark.id === gesture.id), p); changed(); markers(); preview();
});
function endGesture() { if (gesture?.saved) render(); gesture = null; }
$("photo").addEventListener("pointerup", endGesture); $("photo").addEventListener("pointercancel", endGesture);
$("photo").addEventListener("wheel", event => {
  if (!current) return; event.preventDefault();
  const p = point(event), factor = Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * .003);
  const width = Math.max(current.width / 12, Math.min(current.width * 1.5, view.width * factor)), ratio = width / view.width;
  view = { x: p.x - (p.x - view.x) * ratio, y: p.y - (p.y - view.y) * ratio, width, height: view.height * ratio }; paintView();
}, { passive: false });
document.querySelectorAll('[name="tool"]').forEach(input => input.onchange = () => { splitSource = null; setTool(input.value); });
$("fit").onclick = fit;
$("zoom").oninput = () => {
  if (!current) return;
  const width = current.width / Number($("zoom").value), ratio = width / view.width;
  view = { x: view.x + (view.width - width) / 2, y: view.y + view.height * (1 - ratio) / 2, width, height: view.height * ratio }; paintView();
};
$("labels").onchange = event => document.body.classList.toggle("hide-labels", !event.target.checked);
$("overlay").onchange = event => document.body.classList.toggle("hide-overlay", !event.target.checked);
$("flaggedOnly").onchange = render;
$("confirm").onclick = () => edit(() => { activeMark().uncertain = false; });
$("exclude").onclick = () => edit(() => {
  const mark = activeMark(), excluded = isExcluded(mark.id);
  current[excluded ? "excluded" : "marks"] = current[excluded ? "excluded" : "marks"].filter(m => m.id !== mark.id);
  current[excluded ? "marks" : "excluded"].push(mark);
});
$("split").onclick = () => { splitSource = active; setTool("split"); status("Click the second impact location"); };
$("merge").onclick = () => edit(() => {
  const ids = [...selected].filter(id => !isExcluded(id)), keep = ids.includes(active) ? active : ids[0];
  const survivor = current.marks.find(mark => mark.id === keep);
  const removed = current.marks.filter(mark => ids.includes(mark.id) && mark.id !== keep);
  survivor.feedback = `${survivor.feedback || ""}\nMerged with ${removed.map(label).join(", ")}; retained this location.`.trim(); survivor.uncertain = false;
  current.marks = current.marks.filter(mark => !removed.includes(mark)); current.excluded.push(...removed);
  active = keep; selected = new Set([keep]);
});
$("undo").onclick = () => {
  if (!history.length) return; current = history.pop(); active = allMarks().some(mark => mark.id === active) ? active : current.marks[0]?.id;
  selected = new Set(active ? [active] : []); $("name").value = current.name; $("date").value = current.date; $("targetFeedback").value = current.reviewFeedback || ""; $("reviewState").value = current.reviewState || "draft";
  changed(); render();
};
$("nextFlag").onclick = () => {
  const flags = current?.marks.filter(mark => mark.uncertain) || []; if (!flags.length) { status("No flagged impacts"); return; }
  active = flags[(flags.findIndex(mark => mark.id === active) + 1) % flags.length].id; selected = new Set([active]); render();
};
for (const [id, key] of [["name", "name"], ["date", "date"], ["targetFeedback", "reviewFeedback"], ["reviewState", "reviewState"]]) {
  $(id).oninput = () => { if (!current) return; remember(); current[key] = $(id).value; changed(); };
}
$("markFeedback").oninput = () => { if (!activeMark()) return; remember(); activeMark().feedback = $("markFeedback").value; changed(); };
$("observedCount").oninput = () => { if (!activeMark()) return; remember(); activeMark().observedCount = $("observedCount").value ? Number($("observedCount").value) : null; changed(); };
$("previous").onclick = () => choose(records[records.findIndex(record => record.id === current.id) - 1].id);
$("next").onclick = () => choose(records[records.findIndex(record => record.id === current.id) + 1].id);
$("reload").onclick = load;
$("save").onclick = async () => {
  if (!current || saving) return; saving = true; render(); $("name").disabled = $("date").disabled = $("targetFeedback").disabled = $("reviewState").disabled = true;
  try {
    current = await request(`/api/targets/${current.id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Target-Review": "1" }, body: JSON.stringify(current) });
    records = records.map(record => record.id === current.id ? current : record);
    dirty = false; history = []; queue(); status(current.reviewState === "ready" ? "Saved / ready for revision" : "Saved locally / site unchanged");
  } catch (error) { status(error.message, true); }
  finally { saving = false; $("name").disabled = $("date").disabled = $("targetFeedback").disabled = $("reviewState").disabled = false; render(); }
};
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => { if (event.key === "Escape") { splitSource = null; setTool("select"); } });
await load();
