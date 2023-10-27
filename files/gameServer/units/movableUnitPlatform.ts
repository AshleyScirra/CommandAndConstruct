
import { UnitPlatform } from "./unitPlatform.js";
import { MovableObject } from "../classes/movableObject.js";
import { UnitMovementController } from "./movement/unitMovementController.js";
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
	#movable;				// MovableObject to represent platform position
	
	// UnitMovementController manages actual navigation of unit along paths (lazy-created)
	#movementController = null;
	
	#lastSpeed = 0;			// Speed on previous tick
	#maxSpeed = 250;		// Maximum speed in px/s/s
	#maxAcceleration = 250;	// Maximum acceleration in px/s/s
	#maxDeceleration = 500;	// Maximum deceleration (braking) in px/s/s
	#curAcceleration = 0;	// Current acceleration
	
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
	
	Release()
	{
		this.ReleaseMovementController();
		
		super.Release();
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
	
	SetSpeed(s, sendDelta = true)
	{
		// Limit to maximum speed
		s = MathUtils.Clamp(s, -this.#maxSpeed, this.#maxSpeed);
		
		if (s === this.GetSpeed())
			return;		// no change
		
		this.#movable.SetSpeed(s);

		// Note that speed changes that occur merely to apply acceleration don't send delta updates,
		// as the client adjusts the speed according to the current acceleration, avoiding the need
		// to use up bandwidth sending constant speed changes as units accelerate or decelerate normally.
		// By default speed changes do send a delta update, in case of things like stopping due to hitting
		// an obstacle, since that is not a change the client can easily predict, so only the normal
		// speed changes due to acceleration/deceleration opt-out of sending delta updates.
		if (sendDelta)
			this.GetUnit().MarkPlatformSpeedChanged();
	}
	
	GetLastSpeed()
	{
		return this.#lastSpeed;
	}
	
	GetMaxSpeed()
	{
		return this.#maxSpeed;
	}
	
	GetAcceleration()
	{
		return this.#curAcceleration;
	}
	
	SetAcceleration(a)
	{
		// Apply limits of maximum allowed deceleration and acceleration
		a = MathUtils.Clamp(a, -this.#maxDeceleration, this.#maxAcceleration);
		
		if (a === this.GetAcceleration())
			return;		// no change
		
		this.#curAcceleration = a;
		
		// Flag that the acceleration changed for delta updates
		this.GetUnit().MarkPlatformAccelerationChanged();
	}
	
	GetMaxAcceleration()
	{
		return this.#maxAcceleration;
	}
	
	GetMaxDeceleration()
	{
		return this.#maxDeceleration;
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
	
	GetRotateSpeed()
	{
		return this.#rotateSpeed;
	}
	
	// Unit has been commanded to move to the given position. Use pathfinding to find a series
	// of waypoints to arrive at the destination.
	async MoveToPosition(x, y)
	{
		// Clamp target position inside the layout area.
		[x, y] = this.GetGameServer().ClampToLayout(x, y);
		
		// If there is an existing movement controller, bring the unit to a halt while it
		// waits for the path to be found.
		if (this.#movementController)
		{
			this.#movementController.Stop();
		}
		
		// Find a path from the unit's current position to the destination, and store the result
		// as the list of waypoints to move to. (Note this can be null if no path was found.)
		const [myX, myY] = this.GetPosition();
		const waypoints = await this.GetGameServer().GetPathfinding().FindPath(myX, myY, x, y);
		
		// If no path was found, bail out. This will leave any prior movement controller
		// bringing the unit to a halt, and when it stops it will release the movement controller.
		if (waypoints === null)
			return;
		
		// Otherwise a path was found, so create a movement controller if there wasn't already
		// one, and start it moving along the path.
		if (!this.#movementController)
		{
			this.#movementController = new UnitMovementController(this);
		}
		
		this.#movementController.StartMovingAlongWaypoints(waypoints);
	}
	
	Tick(dt)
	{
		// If a movement controller exists, tick it to advance the unit movement.
		if (this.#movementController)
		{
			this.#movementController.Tick(dt);
			
			this.#lastSpeed = this.GetSpeed();
		}
	}
	
	// When the unit comes to a halt it doesn't need the movement controller any more so
	// it is released, which also allows it to be garbage collected to reduce memory use.
	ReleaseMovementController()
	{
		if (this.#movementController)
		{
			this.#movementController.Release();
			this.#movementController = null;
			
			// Set the unit debug state back to 0 to hide its movement state
			this.GetUnit().SetDebugState(0);
		}
	}
	
	// The base class ContainsPoint methods check the point relative to the origin.
	// So first translate the point to be relative to the unit position.
	ContainsPoint_Full(x, y)
	{
		const [myX, myY] = this.GetPosition();
		return super.ContainsPoint_Full(x - myX, y - myY);
	}
	
	ContainsPoint_Obstacle(x, y)
	{
		const [myX, myY] = this.GetPosition();
		return super.ContainsPoint_Obstacle(x - myX, y - myY);
	}
}