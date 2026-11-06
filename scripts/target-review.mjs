const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
let records = [], current = null, active = null, selected = new Set(), dirty = false, history = [], tool = "select";
let view = null, gesture = null, saving = false;
const label = mark => mark.id.replace(/^impact-/, "").replace(/^pin-/, "Pin ");
const allMarks = () => current ? [...current.marks, ...current.excluded] : [];
const activeMark = () => current?.marks.find(mark => mark.id === active);
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
    small.textContent = `${record.marks.length} marks / ${record.marks.filter(mark => mark.uncertain).length} flagged`;
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
    history = []; dirty = false; setTool("select");
    $("photoImage").setAttribute("href", `/api/targets/${id}/image`);
    $("photoImage").setAttribute("width", current.width); $("photoImage").setAttribute("height", current.height);
    $("name").value = current.name; $("date").value = current.date;
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
  for (const mark of current.marks) {
    const classes = ["marker", mark.uncertain ? "flagged" : "", selected.has(mark.id) ? "active" : ""].join(" ");
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
  $("selectedTitle").textContent = mark ? `Mark ${label(mark)}` : "No mark selected";
  $("observation").textContent = mark?.note || "";
  $("delete").disabled = !mark || saving;
  $("counts").textContent = `${current.marks.length} marks / ${current.marks.filter(m => m.uncertain).length} flagged`;
  const index = records.findIndex(record => record.id === current.id);
  $("previous").disabled = index <= 0; $("next").disabled = index >= records.length - 1;
  const list = $("markList"), scroll = list.scrollTop; list.replaceChildren();
  let ordered = [...current.marks];
  if ($("flaggedOnly").checked) ordered = ordered.sort((a, b) => Number(b.uncertain) - Number(a.uncertain));
  for (const m of ordered) {
    const row = document.createElement("div"); row.className = `mark-row${selected.has(m.id) ? " active" : ""}`;
    const button = document.createElement("button"); button.textContent = `Mark ${label(m)}`; button.onclick = () => { selected = new Set([m.id]); active = m.id; render(); };
    const state = document.createElement("small"); state.textContent = m.uncertain ? "Flagged" : "Impact";
    row.append(button, state); list.append(row);
  }
  list.scrollTop = scroll; markers();
}
function newMark(p, feedback = "") {
  const maximum = Math.max(0, ...allMarks().map(mark => Number(mark.id.match(/^impact-(\d+)$/)?.[1]) || 0));
  const mark = { id: `impact-${maximum + 1}`, ...p, uncertain: false, note: "Added during review", feedback };
  current.marks.push(mark); active = mark.id; selected = new Set([mark.id]);
}
$("photo").addEventListener("pointerdown", event => {
  if (!current || saving || ![0, 2].includes(event.button)) return;
  const id = event.target.closest("[data-id]")?.dataset.id;
  if (event.button === 2) {
    const matrix = $("photo").getScreenCTM();
    gesture = { kind: "pan", clientX: event.clientX, clientY: event.clientY, view: { ...view }, scaleX: matrix.a, scaleY: matrix.d };
  } else if (tool === "add") {
    edit(() => newMark(point(event)));
    return;
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
  Object.assign(current.marks.find(mark => mark.id === gesture.id), p); changed(); markers();
});
function endGesture() { if (gesture?.saved) render(); gesture = null; }
$("photo").addEventListener("pointerup", endGesture); $("photo").addEventListener("pointercancel", endGesture);
$("photo").addEventListener("lostpointercapture", endGesture);
$("photo").addEventListener("contextmenu", event => event.preventDefault());
$("photo").addEventListener("wheel", event => {
  if (!current) return; event.preventDefault();
  const p = point(event), factor = Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * .003);
  const width = Math.max(current.width / 12, Math.min(current.width * 1.5, view.width * factor)), ratio = width / view.width;
  view = { x: p.x - (p.x - view.x) * ratio, y: p.y - (p.y - view.y) * ratio, width, height: view.height * ratio }; paintView();
}, { passive: false });
document.querySelectorAll('[name="tool"]').forEach(input => input.onchange = () => setTool(input.value));
$("fit").onclick = fit;
$("zoom").oninput = () => {
  if (!current) return;
  const width = current.width / Number($("zoom").value), ratio = width / view.width;
  view = { x: view.x + (view.width - width) / 2, y: view.y + view.height * (1 - ratio) / 2, width, height: view.height * ratio }; paintView();
};
$("labels").onchange = event => document.body.classList.toggle("hide-labels", !event.target.checked);
$("overlay").onchange = event => document.body.classList.toggle("hide-overlay", !event.target.checked);
$("flaggedOnly").onchange = render;
function deleteMark() {
  if (!activeMark() || saving || gesture) return;
  edit(() => { current.marks = current.marks.filter(mark => mark.id !== active); active = null; selected.clear(); });
}
$("delete").onclick = deleteMark;
$("undo").onclick = () => {
  if (!history.length || saving) return; current = history.pop(); active = current.marks.some(mark => mark.id === active) ? active : current.marks[0]?.id;
  selected = new Set(active ? [active] : []); $("name").value = current.name; $("date").value = current.date;
  changed(); render();
};
for (const [id, key] of [["name", "name"], ["date", "date"]]) {
  $(id).oninput = () => { if (!current) return; remember(); current[key] = $(id).value; changed(); };
}
$("previous").onclick = () => choose(records[records.findIndex(record => record.id === current.id) - 1].id);
$("next").onclick = () => choose(records[records.findIndex(record => record.id === current.id) + 1].id);
$("reload").onclick = load;
$("save").onclick = async () => {
  if (!current || saving || gesture) return; saving = true; render(); $("name").disabled = $("date").disabled = true;
  try {
    current = await request(`/api/targets/${current.id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Target-Review": "1" }, body: JSON.stringify(current) });
    records = records.map(record => record.id === current.id ? current : record);
    dirty = false; history = []; queue(); status("Saved locally / site unchanged");
  } catch (error) { status(error.message, true); }
  finally { saving = false; $("name").disabled = $("date").disabled = false; render(); }
};
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => {
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === "Escape") setTool("select");
  if (["Delete", "Backspace"].includes(event.key) && !event.repeat) { event.preventDefault(); deleteMark(); }
});
await load();
