
import { PositionedAndAngledObject } from "./positionedAndAngledObject.js";

// A MovableObject has a position, angle, and speed it is moving at.
// It inherits from PositionedAndAngledObject for its position and angle.
export class MovableObject extends PositionedAndAngledObject {

	// Private fields
	#speed = 0;				// speed in pixels per second
	
	constructor(gameServer, x, y, angle)
	{
		super(gameServer, x, y, angle);
	}
	
	SetSpeed(s)
	{
		this.#speed = s;
	}
	
	GetSpeed()
	{
		return this.#speed;
	}
}