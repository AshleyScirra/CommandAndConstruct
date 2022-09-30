
import { UnitPlatform } from "./unitPlatform.js";
import { MovableObject } from "../classes/movableObject.js";
import * as MathUtils from "../utils/mathUtils.js";

// A MovableUnitPlatform is a unit platform that can move, such as the driving platform
// of a tank. This is in contrast to a static platform, such as a fixed gun emplacement.
// Notice that here we could do with multiple inheritance, as we want to inherit from
// both UnitPlatform and MovableObject. Since JavaScript doesn't support multiple
// inheritance, and multiple inheritance is a controversial and complicated topic in
// itself, here we just use composition instead: the MovableObject is a private
// property of the class.
export class MovableUnitPlatform extends UnitPlatform {

	// Private fields
	#movable;			// MovableObject to represent platform position
	
	#isMoving = false;	// Moving state
	#targetX = 0;		// When moving, the position to move to
	#targetY = 0;
	
	constructor(unit, x, y)
	{
		super(unit);
		
		this.#movable = new MovableObject(unit.GetGameServer(), x, y);
	}
	
	GetPosition()
	{
		return this.#movable.GetPosition();
	}
	
	MoveToPosition(x, y)
	{
		// Set the moving state to the target position
		this.#isMoving = true;
		this.#targetX = x;
		this.#targetY = y;
		
		// Set the movable angle and speed to go directly to the target.
		// TODO: pathfinding, better movement, per-unit speeds etc.
		const [currentX, currentY] = this.GetPosition();
		const angle = MathUtils.AngleTo(currentX, currentY, this.#targetX, this.#targetY);
		this.#movable.SetAngle(angle)
		this.#movable.SetSpeed(200);	// hard-coded speed for now
	}
	
	Tick(dt)
	{
		if (this.#isMoving)
		{
			this.#TickMovement(dt);
		}
	}
	
	#TickMovement(dt)
	{
		// Calculate the distance to move this tick.
		const moveDist = this.#movable.GetSpeed() * dt;
		
		// Check if we've arrived, which is when the target position is nearer than the
		// distance to move. Note this compares squared distances so there doesn't have
		// to be an expensive square root calculation.
		const [x, y] = this.GetPosition();
		
		if (moveDist * moveDist >= MathUtils.DistanceSquared(x, y, this.#targetX, this.#targetY))
		{
			// Arrived at target position
			this.#movable.SetPosition(this.#targetX, this.#targetY);
			this.#isMoving = false;
		}
		else
		{
			// Not yet arrived: advance by the move distance on the current angle.
			const angle = this.#movable.GetAngle();
			const dx = Math.cos(angle) * moveDist;
			const dy = Math.sin(angle) * moveDist;
			this.#movable.SetPosition(x + dx, y + dy);
		}
	}
}