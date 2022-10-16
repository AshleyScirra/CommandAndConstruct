
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

// Convert degrees to radians.
export function ToRadians(degrees)
{
	return degrees * Math.PI / 180;
};

// Calculate the difference between two angles in radians.
export function AngleDifference(a1, a2)
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

// Rotate angle 'start' towards angle 'end' by amount 'step'.
export function AngleRotate(start, end, step)
{
	const ss = Math.sin(start);
	const cs = Math.cos(start);
	const se = Math.sin(end);
	const ce = Math.cos(end);
	
	// Difference to end is greater than step
	if (Math.acos(ss * se + cs * ce) > step)
	{
		if (cs * se - ss * ce > 0)
			return start + step;		// step clockwise
		else
			return start - step;		// step anticlockwise
	}
	else
	{
		// Difference to end is less than step: return end angle
		return end;
	}
};

// Rotate point p around point o using an angle
export function RotatePoint(px, py, angle, ox, oy)
{
	return RotatePoint2(px, py, Math.sin(angle), Math.cos(angle), ox, oy);
}


// As with RotatePoint but using precomputed sin(angle) and cos(angle)
export function RotatePoint2(px, py, sin_a, cos_a, ox, oy)
{
	const dx = px - ox;
	const dy = py - oy;
	
	const rx = (dx * cos_a) - (dy * sin_a);
	const ry = (dy * cos_a) + (dx * sin_a);
	
	return [rx + ox, ry + oy];
}
