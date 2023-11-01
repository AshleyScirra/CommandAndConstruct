
// For converting a 16-bit angle back in to a float in the range [0, 2pi)
export function Uint16ToAngle(a: number)
{
	return (a * 2 * Math.PI) / 65535;
};

// Same as equivalent GameServer function
export function Clamp(x: number, lower: number, upper: number)
{
	if (x < lower)
		return lower;
	else if (x > upper)
		return upper;
	else
		return x;
};

// Same as equivalent GameServer function
export function DistanceTo(x1: number, y1: number, x2: number, y2: number)
{
	return Math.hypot(x2 - x1, y2 - y1);
};

export function DistanceSquared(x1: number, y1: number, x2: number, y2: number)
{
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
};

export function IsPointInRectangle(x: number, y: number, left: number, top: number, right: number, bottom: number)
{
	return x >= left && x <= right && y >= top && y <= bottom;
}

// Linear interpolation
export function lerp(a: number, b: number, x: number)
{
	return a + (b - a) * x;
}

// Return the angle in radians from the first position to the second.
export function AngleTo(x1: number, y1: number, x2: number, y2: number)
{
	return Math.atan2(y2 - y1, x2 - x1);
};

// Calculate the difference between angles in the shortest direction.
export function AngleDifference(a1: number, a2: number)
{
	if (a1 === a2)
		return 0;		// angles identical

	const s1 = Math.sin(a1);
	const c1 = Math.cos(a1);
	const s2 = Math.sin(a2);
	const c2 = Math.cos(a2);
	const n = s1 * s2 + c1 * c2;
	
	if (n >= 1)			// prevent NaN results
		return 0;
	if (n <= -1)
		return Math.PI;
		
	return Math.acos(n);
}

// Test if a1 is clockwise of a2 in the shortest direction.
export function AngleClockwise(a1: number, a2: number)
{
	const s1 = Math.sin(a1);
	const c1 = Math.cos(a1);
	const s2 = Math.sin(a2);
	const c2 = Math.cos(a2);
	return c1 * s2 - s1 * c2 <= 0;
};

// Angular interpolation from angle a to b in the shortest direction.
export function angleLerp(a: number, b: number, x: number)
{
	const diff = AngleDifference(a, b);
	
	// b clockwise from a
	if (AngleClockwise(b, a))
		return a + diff * x;
	else
		return a - diff * x;
};