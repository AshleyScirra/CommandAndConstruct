
import { PositionedObject } from "./positionedObject.js";

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
		// Ensure the angle is always in the range [-pi, pi].
		// This avoids precision issues if the angle ends up very large from
		// constantly incrementing it as it rotates.
		this.#angle = a % Math.PI;
	}
	
	GetAngle()
	{
		return this.#angle;
	}
}