
// Return the angle in radians from the first position to the second.
export function AngleTo(x1, y1, x2, y2)
{
	return Math.atan2(y2 - y1, x2 - x1);
};

// Return the distance between two points. Note this will involve a square
// root in the calculation - DistanceSquared is faster.
export function DistanceTo(x1, y1, x2, y2)
{
	return Math.hypot(x2 - x1, y2 - y1);
};

// Return the distance squared between two points. This is useful to avoid
// the need to calculate a square root when comparing distances.
export function DistanceSquared(x1, y1, x2, y2)
{
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
};