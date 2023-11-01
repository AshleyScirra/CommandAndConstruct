const _2pi = 2 * Math.PI;
// Return a value x "clamped" between the minimum and maximum values,
// i.e. not lower than the minimum value and not higher than the maximum value.
export function Clamp(x, lower, upper) {
    if (x < lower)
        return lower;
    else if (x > upper)
        return upper;
    else
        return x;
}
;
// Return the angle in radians from the first position to the second.
export function AngleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}
;
// Return the distance between two points. Note this will involve a square
// root in the calculation - DistanceSquared is faster.
export function DistanceTo(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}
;
// Return the distance squared between two points. This is useful to avoid
// the need to calculate a square root when comparing distances.
export function DistanceSquared(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}
;
// Convert degrees to radians.
export function ToRadians(degrees) {
    return degrees * Math.PI / 180;
}
;
// Calculate the difference between two angles in radians.
export function AngleDifference(a1, a2) {
    if (a1 === a2)
        return 0; // angles identical
    const s1 = Math.sin(a1);
    const c1 = Math.cos(a1);
    const s2 = Math.sin(a2);
    const c2 = Math.cos(a2);
    const n = s1 * s2 + c1 * c2;
    if (n >= 1) // prevent NaN results
        return 0;
    if (n <= -1)
        return Math.PI;
    return Math.acos(n);
}
// Rotate angle 'start' towards angle 'end' by amount 'step'.
export function AngleRotate(start, end, step) {
    const ss = Math.sin(start);
    const cs = Math.cos(start);
    const se = Math.sin(end);
    const ce = Math.cos(end);
    // Difference to end is greater than step
    if (Math.acos(ss * se + cs * ce) > step) {
        if (cs * se - ss * ce > 0)
            return start + step; // step clockwise
        else
            return start - step; // step anticlockwise
    }
    else {
        // Difference to end is less than step: return end angle
        return end;
    }
}
;
// Rotate point p around origin (0, 0)
export function RotatePoint(x, y, angle) {
    return RotatePoint2(x, y, Math.sin(angle), Math.cos(angle));
}
// As with RotatePoint but using precomputed sin(angle) and cos(angle)
export function RotatePoint2(x, y, sin_a, cos_a) {
    const rx = (x * cos_a) - (y * sin_a);
    const ry = (y * cos_a) + (x * sin_a);
    return [rx, ry];
}
// Test if two segments intersect, given by the first line (a1x, a1y) -> (a2x, a2y),
// and the second line (b1x, b1y) -> (b2x, b2y).
export function SegmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
    const det = (a2x - a1x) * (b2y - b1y) - (b2x - b1x) * (a2y - a1y);
    if (det === 0) {
        return false;
    }
    else {
        const lambda = ((b2y - b1y) * (b2x - a1x) + (b1x - b2x) * (b2y - a1y)) / det;
        const gamma = ((a1y - a2y) * (b2x - a1x) + (a2x - a1x) * (b2y - a1y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    }
}
;
// To save bandwidth, angles are transmitted as 16-bit values. These have a range of
// 0-65536, so a value in radians is expanded to that range. This has a precision of
// about 0.005 degrees per increment, which is pretty good - over a distance of
// 10,000 pixels that will only be off by about 1 pixel, so this should be good enough.
export function AngleToUint16(a) {
    // Ensure in [0, 2pi) range
    a %= _2pi;
    if (a < 0)
        a += _2pi;
    a = (a * 65535) / _2pi;
    return Math.round(a);
}
// Calculate the angle to aim at taking in to account the target's movement.
// Aiming directly at a moving target often means projectiles miss, since by the time the
// projectile reaches the target, it's moved away. This calculation takes in to account
// the projectile speed and target's speed and angle, aiming at where the target will be
// by the time the projectile arrives - but all assuming the target stays at the same
// speed and angle.
export function PredictiveAim(fromX, fromY, projectileSpeed, targetX, targetY, targetSpeed, targetAngle) {
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const h = targetAngle + Math.PI;
    const w = (targetSpeed * Math.sin(h) * (fromX - targetX) - targetSpeed * Math.cos(h) * (fromY - targetY)) / projectileSpeed;
    const a = (Math.asin(w / Math.hypot(dy, dx)) - Math.atan2(dy, -dx)) + Math.PI;
    // If the calculation produced a valid angle, return it. Otherwise if there
    // is not a finite result (including NaN), perhaps there is no valid solution,
    // so resort to direct aim instead.
    if (isFinite(a))
        return a;
    else
        return AngleTo(fromX, fromY, targetX, targetY);
}
