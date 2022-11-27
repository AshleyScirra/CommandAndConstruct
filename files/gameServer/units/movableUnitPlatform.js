
import { UnitPlatform } from "./unitPlatform.js";
import { MovableObject } from "../classes/movableObject.js";
import * as MathUtils from "../utils/mathUtils.js";

const _2PI = 2 * Math.PI;

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
	#moveSpeed = 250;
	
	// Rotation speed in radians per second
	#rotateSpeed = MathUtils.ToRadians(90);
	
	// Last angle in the network Uint16 format, so delta updates are only sent when
	// the value sent over the network changes.
	#lastAngleAsUint16 = 0;
	
	constructor(unit, objectData, x, y, angle)
	{
		super(unit, objectData);
		
		this.#movable = new MovableObject(unit.GetGameServer(), x, y, angle);
		
		// Initialise the angle in network uint16 format.
		this.#lastAngleAsUint16 = MathUtils.AngleToUint16(angle);
		
		// Update collision shape and collision cells for initial position.
		this.UpdateCollision();
	}
	
	GetPosition()
	{
		return this.#movable.GetPosition();
	}
	
	SetPosition(x, y)
	{
		// Prevent the position going outside the layout.
		[x, y] = this.GetGameServer().ClampToLayout(x, y);
		
		// Check if the position has really changed.
		const [curX, curY] = this.GetPosition();
		if (curX === x && curY === y)
			return;		// no change
		
		// Set the movable position.
		this.#movable.SetPosition(x, y);
		
		// Moving the platform could affect which collision cells it is in,
		// so update the collision box.
		this.UpdateCollision();
	}
	
	// Return the position of the turret on this platform. This gets the turret's position
	// (which is an offset from the platform) and rotates it by the platform angle.
	GetTurretPosition()
	{
		const [platformX, platformY] = this.GetPosition();
		let [offX, offY] = this.GetUnit().GetTurret().GetPosition();
		[offX, offY] = MathUtils.RotatePoint(offX, offY, this.GetAngle());
		return [platformX + offX, platformY + offY];
	}
	
	GetSpeed()
	{
		return this.#movable.GetSpeed();
	}
	
	SetSpeed(s)
	{
		if (s === this.GetSpeed())
			return;		// no change
		
		this.#movable.SetSpeed(s);
		
		// Flag that the speed changed for delta updates
		this.GetUnit().MarkPlatformSpeedChanged();
	}
	
	GetAngle()
	{
		return this.#movable.GetAngle();
	}
	
	SetAngle(a)
	{
		// Wrap the angle the same way it is in PositionedAndAngledObject
		// to ensure the subsequent comparison works as intended
		a = a % _2PI;
		if (a < 0)
			a += _2PI;
		
		if (a === this.GetAngle())
			return;		// no change
		
		this.#movable.SetAngle(a);
		
		// Update the collision shape so the polygon rotates with the object, and if necessary
		// update which collision cells the platform is in, since rotation could affect that.
		this.UpdateCollision();
		
		// Platform angles are sent as uint16s over the network. The actual angle continuously
		// varies by tiny fractional amounts as units move, due to floating point precision errors -
		// the calculated angle to the target will be constantly recomputed slightly differently.
		// That should not cause delta updates to keep being sent, since the value rounded to
		// a uint16 does not actually change with extremely small changes in the angle. Therefore
		// only send a delta update if the angle changes enough for the corresponding uint16 to change.
		const angleAsUint16 = MathUtils.AngleToUint16(a);
		if (this.#lastAngleAsUint16 !== angleAsUint16)
		{
			this.GetUnit().MarkPlatformAngleChanged(a);
			this.#lastAngleAsUint16 = angleAsUint16;
		}
	}
	
	MoveToPosition(x, y)
	{
		// Set the moving state to the target position. Also clamp the target position
		// to the layout.
		this.#isMoving = true;
		[x, y] = this.GetGameServer().ClampToLayout(x, y);
		this.#targetX = x;
		this.#targetY = y;
	}
	
	ContainsPoint(x, y)
	{
		// The base class ContainsPoint() method checks the point relative to the origin.
		// So first translate the point to be relative to the unit position.
		const [myX, myY] = this.GetPosition();
		return super.ContainsPoint(x - myX, y - myY);
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
		const currentAngle = this.GetAngle();
		
		// Current angle points at angle to target: start moving.
		// Note this counts being within 0.01 degrees as pointing at the target. This helps avoid
		// floating point rounding errors failing to match closely, especially as the unit moves.
		if (MathUtils.AngleDifference(targetAngle, currentAngle) < MathUtils.ToRadians(0.01))
		{
			// Set the movement speed. (TODO: acceleration)
			this.SetSpeed(this.#moveSpeed);
			
			// Also update the angle directly to the target to correct any small rounding errors.
			// This will only perform a small correction so is unlikely to be visible to players.
			this.SetAngle(targetAngle);
			
			// Calculate the distance to move this tick.
			const moveDist = this.GetSpeed() * dt;
			
			// Check if we've arrived, which is when the target position is nearer than the
			// distance to move. Note this compares squared distances so there doesn't have
			// to be an expensive square root calculation.
			if (moveDist * moveDist >= MathUtils.DistanceSquared(currentX, currentY, this.#targetX, this.#targetY))
			{
				// Arrived at target position
				this.SetPosition(this.#targetX, this.#targetY);
				this.SetSpeed(0);
				this.#isMoving = false;
			}
			else
			{
				// Not yet arrived: advance by the move distance on the current angle.
				const dx = Math.cos(targetAngle) * moveDist;
				const dy = Math.sin(targetAngle) * moveDist;
				this.SetPosition(currentX + dx, currentY + dy);
			}
		}
		else
		{
			// Unit is not pointing directly at its target: rotate towards the target.
			this.SetSpeed(0);
			this.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, this.#rotateSpeed * dt));
		}
	}
}