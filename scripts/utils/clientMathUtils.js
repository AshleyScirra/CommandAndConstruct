
// For converting a 16-bit angle back in to a float in the range [0, 2pi)
export function Uint16ToAngle(a)
{
	return (a * 2 * Math.PI) / 65535;
};

// Same as equivalent GameServer function
export function DistanceTo(x1, y1, x2, y2)
{
	return Math.hypot(x2 - x1, y2 - y1);
};