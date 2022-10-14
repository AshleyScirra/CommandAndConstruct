
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
	
	// Movement speed in units per second
	#moveSpeed = 200;
	
	// Rotation speed in radians per second
	#rotateSpeed = MathUtils.ToRadians(90);
	
	constructor(unit, x, y)
	{
		super(unit);
		
		this.#movable = new MovableObject(unit.GetGameServer(), x, y);
		
		// Temporary hack: initialise player 1's units facing left,
		// otherwise they face away from player 0's units.
		if (this.GetUnit().GetPlayer() === 1)
			this.#movable.SetAngle(Math.PI);
	}
	
	GetPosition()
	{
		return this.#movable.GetPosition();
	}
	
	GetAngle()
	{
		return this.#movable.GetAngle();
	}
	
	MoveToPosition(x, y)
	{
		// Set the moving state to the target position
		this.#isMoving = true;
		this.#targetX = x;
		this.#targetY = y;
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
		// Movement currently happens in two phases:
		// 1) rotate to point towards the target
		// 2) start moving once pointing directly towards the target
		// TODO: pathfinding, better movement, per-unit speeds etc.
		const [currentX, currentY] = this.GetPosition();
		const targetAngle = MathUtils.AngleTo(currentX, currentY, this.#targetX, this.#targetY);
		const currentAngle = this.#movable.GetAngle();
		
		// Current angle points at angle to target: start moving.
		// Note this counts being within 0.01 degrees as pointing at the target. This helps avoid
		// floating point rounding errors failing to match closely, especially as the unit moves.
		if (MathUtils.AngleDifference(targetAngle, currentAngle) < MathUtils.ToRadians(0.01))
		{
			// Set the movement speed. (TODO: acceleration)
			this.#movable.SetSpeed(this.#moveSpeed);
			
			// Also update the angle directly to the target to correct any small rounding errors.
			// This will only perform a small correction so is unlikely to be visible to players.
			this.#movable.SetAngle(targetAngle);
			
			// Calculate the distance to move this tick.
			const moveDist = this.#movable.GetSpeed() * dt;
			
			// Check if we've arrived, which is when the target position is nearer than the
			// distance to move. Note this compares squared distances so there doesn't have
			// to be an expensive square root calculation.
			if (moveDist * moveDist >= MathUtils.DistanceSquared(currentX, currentY, this.#targetX, this.#targetY))
			{
				// Arrived at target position
				this.#movable.SetPosition(this.#targetX, this.#targetY);
				this.#isMoving = false;
			}
			else
			{
				// Not yet arrived: advance by the move distance on the current angle.
				const dx = Math.cos(targetAngle) * moveDist;
				const dy = Math.sin(targetAngle) * moveDist;
				this.#movable.SetPosition(currentX + dx, currentY + dy);
			}
		}
		else
		{
			// Unit is not pointing directly at its target: rotate towards the target.
			this.#movable.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, this.#rotateSpeed * dt));
		}
	}
}