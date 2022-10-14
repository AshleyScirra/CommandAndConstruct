
import { PositionedObject } from "./positionedObject.js";

const _2PI = 2 * Math.PI;

// A PositionedAndAngledObject has both a position and an angle,
// inheriting from PositionedObject for the position.
export class PositionedAndAngledObject extends PositionedObject {

	// Private fields
	#angle = 0;				// angle in radians
	
	constructor(gameServer, x, y)
	{
		super(gameServer, x, y);
		
		this.#angle = 0;
	}
	
	SetAngle(a)
	{
		// Ensure the angle is always in the range [0, 2pi].
		// This avoids precision issues if the angle ends up very large from
		// constantly incrementing it as it rotates.
		a = a % _2PI;
		if (a < 0)
			a += _2PI;
		
		this.#angle = a;
	}
	
	GetAngle()
	{
		return this.#angle;
	}
}