# Archery Shot Location Format v0.1

This document defines a small, portable data format for archery shot location.
The core principle is:

> Shot location is primary. Score is derived.

An app records where the arrow landed. A target definition and scoring rule turn
that point into a score.

## Coordinate System

Shot coordinates are recorded relative to a single target face.

```json
{
  "x": -0.18,
  "y": 0.42
}
```

Coordinates use normalized target units:

| Field | Meaning |
| --- | --- |
| `x` | Horizontal position from target center |
| `y` | Vertical position from target center |
| `0, 0` | Center of the target face |
| `x = -1` | Left edge of the outer scoring radius |
| `x = 1` | Right edge of the outer scoring radius |
| `y = 1` | Top edge of the outer scoring radius |
| `y = -1` | Bottom edge of the outer scoring radius |

The normalized radius is computed as:

```txt
r = sqrt(x * x + y * y)
```

A shot with `r > 1` is outside the scoring face and is a miss unless the target
definition says otherwise.

## Target Definition

A target definition describes the physical target face and its scoring geometry.
The target file is the authority for scoring.

```json
{
  "schema": "archery-target-v0.1",
  "id": "fita-40-single-10-ring",
  "name": "FITA 40cm Single Spot",
  "outerScoringDiameterCm": 40,
  "outerScoringRadiusCm": 20,
  "rings": [
    {
      "score": 10,
      "outerRadiusCm": 2,
      "outerRadius": 0.1
    }
  ]
}
```

Target definitions should include:

| Field | Meaning |
| --- | --- |
| `outerScoringDiameterCm` | Physical scoring diameter |
| `outerScoringRadiusCm` | Physical scoring radius |
| `rings` | Score rings ordered from center outward |
| `tieBreakRings` | Inner rings that do not change normal score, such as X |
| `lineRule` | How arrows touching a ring line are scored |

## Scoring

Scoring is derived by comparing the shot radius to the target rings.

```txt
shotRadius = sqrt(x * x + y * y)
score = first ring where shotRadius <= ring.outerRadius
```

The default line rule is `touches-higher-ring`, meaning an arrow touching the
line between two rings receives the higher value. A complete scoring engine will
also need arrow shaft diameter and target scale in order to determine line
cutters from a plotted shaft edge rather than a center point.

For line-cutter scoring, compare the edge of the shaft against each scoring
ring:

```txt
arrowRadiusOnTarget = arrowOuterDiameterMm / 10 / 2 / target.outerScoringRadiusCm
effectiveRadius = shotCenterRadius - arrowRadiusOnTarget
score = first ring where effectiveRadius <= ring.outerRadius
```

For example, an Easton 660 shaft with a 5.46mm outer diameter has a 2.73mm
radius. On a FITA 40 target with a 20cm outer scoring radius, that shaft radius
is `0.01365` in normalized target units.

## Equipment

Equipment can be attached to a session so scoring can account for arrow
diameter and future analysis can separate results by setup.

```json
{
  "arrow": {
    "id": "easton-660",
    "model": "Easton 660",
    "outerDiameterMm": 5.46
  }
}
```

## Target Layouts

Single-spot and multi-spot targets use the same shot model. Multi-spot targets
are modeled as layouts containing multiple circular faces.

```json
{
  "schema": "archery-layout-v0.1",
  "id": "fita-40-vertical-three-spot",
  "faces": [
    { "id": "top", "targetId": "fita-40-single-10-ring", "cx": 0.5, "cy": 0.2 },
    { "id": "middle", "targetId": "fita-40-single-10-ring", "cx": 0.5, "cy": 0.5 },
    { "id": "bottom", "targetId": "fita-40-single-10-ring", "cx": 0.5, "cy": 0.8 }
  ]
}
```

Each shot records the face it belongs to:

```json
{
  "shotId": "s001",
  "faceId": "middle",
  "x": -0.18,
  "y": 0.42
}
```

## Session Shape

A session groups ends and shots with the equipment and shooting context.

```json
{
  "schema": "archery-session-v0.1",
  "sessionId": "2026-05-09-practice",
  "startedAt": "2026-05-09T18:30:00-04:00",
  "targetId": "fita-40-single-10-ring",
  "equipment": {
    "arrowId": "easton-660"
  },
  "distance": {
    "value": 18,
    "unit": "m"
  },
  "ends": [
    {
      "endNumber": 1,
      "shots": [
        { "shotId": "s001", "shotNumber": 1, "faceId": "single", "x": -0.18, "y": 0.42 }
      ]
    }
  ]
}
```

## Derived Values

Applications may store derived values for convenience, but they should be
treated as cacheable output, not primary data.

Useful derived values include:

| Field | Meaning |
| --- | --- |
| `r` | Normalized distance from center |
| `angleDeg` | Polar angle from center |
| `score` | Score under a named scoring profile |
| `tieBreak` | Whether the shot is inside an X or other tie-break ring |

## Versioning

Every export includes a `schema` field. Additive fields are allowed within the
same minor version. Breaking changes should use a new schema version.
