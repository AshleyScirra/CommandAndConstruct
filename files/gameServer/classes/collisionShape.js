
import * as MathUtils from "../utils/mathUtils.js";

// CollisionShape represents a collision polygon, with the added ability to rotate it.
// This allows the collision polygon to follow the rotation of unit platforms, for example.
// Note the shape is relative to the origin, so callers must offset collision checks.
export class CollisionShape {

	#gameServer;			// reference to GameServer
	#objectData;			// reference to ObjectData which collision polygon is taken from
	#angle = 0;				// current rotation of this CollisionShape
	#polyPoints = [];		// current list of polygon points with rotation
	
	// The bounding box of the rotated collision shape
	#boxLeft = 0;
	#boxTop = 0;
	#boxRight = 0;
	#boxBottom = 0;
	
	constructor(gameServer, objectData)
	{
		this.#gameServer = gameServer;
		this.#objectData = objectData;
		
		// Take a copy of the original collision polygon and store it in
		// this CollisionShape's polygon points.
		for (const [x, y] of objectData.GetCollisionPoly())
		{
			this.#polyPoints.push([x, y]);
		}
		
		// Get the bounding box of the default (unrotated) collision polygon.
		this.#UpdateBox();
	}
	
	// Update the collision shape for a given angle.
	Update(angle)
	{
		// If the angle is the same as the current angle of the collision shape,
		// ignore this call, as the shape is already up-to-date.
		if (angle === this.#angle)
			return;
		
		// Update all the collision polygon points to rotate them by the
		// given angle. Note to avoid needing to repeatedly calculate sin/cos
		// of the same angle, these are calculated in advanced and the
		// RotatePoint2() method used to pass pre-calculated sin/cos values.
		const originalPoly = this.#objectData.GetCollisionPoly();
		const sin_a = Math.sin(angle);
		const cos_a = Math.cos(angle);
		
		for (let i = 0, len = originalPoly.length; i < len; ++i)
		{
			// Get point in original collision polygon
			const [origX, origY] = originalPoly[i];
			
			// Rotate it around the origin by the given angle (using precalculated
			// sin/cos of the angle). Since poly points are relative to the origin,
			// rotating them around (0, 0) is sufficient.
			const [rx, ry] = MathUtils.RotatePoint2(origX, origY, sin_a, cos_a);
			
			// Save the rotated polygon point to this CollisionShape.
			const polyPoint = this.#polyPoints[i];
			polyPoint[0] = rx;
			polyPoint[1] = ry;
		}
		
		// Save the new angle of the collision shape, and update the bounding box.
		this.#angle = angle;
		this.#UpdateBox();
	}
	
	// Calculate the bounding box of the rotated collision polygon.
	// This just finds the minimum and maximum of all the X and Y co-ordinates of all
	// the polygon points. Initialising all the values to +/-Infinity means it will
	// always use the first point position.
	#UpdateBox()
	{
		let left = Infinity;
		let top = Infinity;
		let right = -Infinity;
		let bottom = -Infinity;
		
		for (const [x, y] of this.#polyPoints)
		{
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x);
			bottom = Math.max(bottom, y);
		}
		
		this.#boxLeft = left;
		this.#boxTop = top;
		this.#boxRight = right;
		this.#boxBottom = bottom;
	}
	
	// Check if a given position is inside the collision shape.
	// Note the point must be relative to the origin, like the collision polygon is itself.
	ContainsPoint(x, y)
	{
		// If the point is outside the collision shape's bounding box, it is definitely not inside
		// the shape. This is also a faster way to test far-away points, since it avoids checking
		// against the collision polygon segments below.
		if (x < this.#boxLeft || y < this.#boxTop || x > this.#boxRight || y > this.#boxBottom)
		{
			return false;
		}
		
		// The point is inside the collision shape's bounding box: do a full check.
		// First of all determine an arbitrary point that is definitely outside the shape.
		const tx = this.#boxLeft;
		const ty = this.#boxTop - 10;
		
		// Test how many times a segment from the given point to the point outside the shape
		// intersects with collision polygon segments. If there is an even number of intersections
		// it is outside the shape; if it's an odd number of intersections, it's inside.
		let intersectionCount = 0;
		
		// Check every segment (line) in the collision polygon.
		for (let i = 0, len = this.#polyPoints.length; i < len; ++i)
		{
			// Get this polygon point and the next polygon point, forming one segment
			// of the collision polygon. Note the next point may wrap around back to the start.
			const [p1x, p1y] = this.#polyPoints[i];
			const [p2x, p2y] = this.#polyPoints[(i + 1) % len];
			
			// Count if there is a segment intersection with this collision polygon segment.
			if (MathUtils.SegmentsIntersect(x, y, tx, ty, p1x, p1y, p2x, p2y))
			{
				intersectionCount++;
			}
		}
		
		// If there is an odd number of intersections, the point is inside the shape.
		return (intersectionCount % 2) === 1;
	}
}