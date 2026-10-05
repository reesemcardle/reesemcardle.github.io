export function dateIsValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function normalizeImpact(point, calibration) {
  if (!calibration?.rings?.length) return null;
  const [cx, cy] = calibration.center;
  const dx = point.x - cx, dy = point.y - cy;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x: 0, y: 0 };
  const ux = dx / distance, uy = dy / distance;
  let priorDistance = 0, priorRadius = 0;
  for (const [radius, ex, ey, rx, ry] of calibration.rings) {
    const ox = cx - ex, oy = cy - ey;
    const a = ux ** 2 / rx ** 2 + uy ** 2 / ry ** 2;
    const b = 2 * (ox * ux / rx ** 2 + oy * uy / ry ** 2);
    const c = ox ** 2 / rx ** 2 + oy ** 2 / ry ** 2 - 1;
    const boundary = (-b + Math.sqrt(b ** 2 - 4 * a * c)) / (2 * a);
    if (!Number.isFinite(boundary) || boundary <= priorDistance) throw new Error("Invalid target alignment.");
    if (distance <= boundary || radius === 1) {
      const r = priorRadius + (radius - priorRadius) * (distance - priorDistance) / (boundary - priorDistance);
      return { x: +(ux * r).toFixed(4), y: +(-uy * r).toFixed(4) };
    }
    priorDistance = boundary;
    priorRadius = radius;
  }
  throw new Error("Alignment must include the outer scoring ring.");
}

export function validateReview(record, approving = false) {
  if (record.reviewFeedback !== undefined && (typeof record.reviewFeedback !== "string" || record.reviewFeedback.length > 10000)) throw new Error("Feedback is too long.");
  if (record.reviewState !== undefined && !["draft", "ready", "reviewed"].includes(record.reviewState)) throw new Error("Invalid review state.");
  if (typeof record.name !== "string" || !record.name.trim() || record.name.length > 160) throw new Error("Enter a target name (up to 160 characters).");
  if (record.date && !dateIsValid(record.date)) throw new Error("Invalid capture date.");
  if (!Array.isArray(record.marks) || record.marks.length > 1000) throw new Error("Invalid impact list.");
  if (!Array.isArray(record.excluded) || record.excluded.length > 1000) throw new Error("Invalid excluded marks.");
  const ids = new Set();
  for (const mark of [...record.marks, ...record.excluded]) {
    if (typeof mark.id !== "string" || ids.has(mark.id) || !Number.isFinite(mark.x) || !Number.isFinite(mark.y) ||
        mark.x < 0 || mark.x > record.width || mark.y < 0 || mark.y > record.height ||
        typeof mark.note !== "string" || mark.note.length > 1000 || typeof mark.uncertain !== "boolean") throw new Error("Invalid impact position or identifier.");
    ids.add(mark.id);
    if (mark.feedback !== undefined && (typeof mark.feedback !== "string" || mark.feedback.length > 2000)) throw new Error("Mark feedback is too long.");
    if (mark.observedCount != null && (!Number.isInteger(mark.observedCount) || mark.observedCount < 1 || mark.observedCount > 100)) throw new Error("Observed count must be 1-100 or unknown.");
  }
  if (record.calibration) {
    const { center, rings } = record.calibration;
    if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) || !Array.isArray(rings) || !rings.length || rings.length > 10) throw new Error("Invalid calibration.");
    let prior = 0;
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length !== 5 || !ring.every(Number.isFinite) || ring[0] <= prior || ring[0] > 1 || ring[3] <= 0 || ring[4] <= 0) throw new Error("Invalid scoring rings.");
      prior = ring[0];
    }
    if (prior !== 1) throw new Error("Missing outer scoring ring.");
    // Check every direction, including those without an observed impact.
    for (let i = 0; i < 36; i++) normalizeImpact({ x: center[0] + Math.cos(i * Math.PI / 18) * record.width, y: center[1] + Math.sin(i * Math.PI / 18) * record.height }, record.calibration);
  }
  if (approving) {
    if (!dateIsValid(record.date)) throw new Error("Enter the photo date before approval.");
    if (!record.calibration || !record.marks.length) throw new Error("This photo needs extraction before approval.");
  }
  return record;
}

export function publicSession(record) {
  validateReview(record, true);
  return {
    schema: "archery-session-v0.1", sessionId: record.id, name: record.name,
    recordedDate: record.date, ...(record.capturedAt ? { capturedAt: record.capturedAt } : {}),
    targetId: "fita-40-single-10-ring", shotOrder: "unknown", positionAccuracy: "approximate",
    equipment: { arrowId: null },
    source: { type: "target-photo", sha256: record.digest, method: "Photo-derived impact locations", scoreMethod: "estimated-center-radius", dateSource: record.date === record.exifDate ? "exif-original" : "manual", flaggedCount: record.marks.filter(mark => mark.uncertain).length },
    ends: [{ endNumber: null, shots: record.marks.map(mark => ({
      shotId: mark.id, faceId: "single", ...normalizeImpact(mark, record.calibration),
      uncertain: mark.uncertain, ...(mark.observedCount ? { observedCount: mark.observedCount } : {}), ...(mark.note ? { note: mark.note } : {})
    })) }]
  };
}
