
import { GameServer } from "../gameServer.js";
import { PositionedAndAngledObject } from "./positionedAndAngledObject.js";

// A MovableObject has a position, angle, and speed it is moving at.
// It inherits from PositionedAndAngledObject for its position and angle.
export class MovableObject extends PositionedAndAngledObject {

	// Private fields
	#speed = 0;				// speed in pixels per second
	
	constructor(gameServer: GameServer, x: number, y: number, angle = 0)
	{
		super(gameServer, x, y, angle);
	}
	
	SetSpeed(s: number)
	{
		this.#speed = s;
	}
	
	GetSpeed()
	{
		return this.#speed;
	}
}