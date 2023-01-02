
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
	#movable;				// MovableObject to represent platform position
	
	#moveState = "";		// String of current movement state (see #TickMovement())
	#waypoints = null;		// Remaining list of positions to move to
	
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
		// Limit to maximum speed
		s = MathUtils.Clamp(s, 0, this.#maxSpeed);
		
		if (s === this.GetSpeed())
			return;		// no change
		
		this.#movable.SetSpeed(s);

		// Note that speed changes don't usually send delta updates -
		// mostly just changes in acceleration are sent instead.
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
	
	// Unit has been commanded to move to the given position. Use pathfinding to find a series
	// of waypoints to arrive at the destination.
	async MoveToPosition(x, y)
	{
		// Clamp target position inside the layout area.
		[x, y] = this.GetGameServer().ClampToLayout(x, y);
		
		// Reset the movement state, bringing the unit to a stop and clearing any prior waypoints.
		this.#moveState = "stopping";
		this.#waypoints = [];
		
		// Find a path from the unit's current position to the destination, and store the result
		// as the list of waypoints to move to. (Note this can be null if no path was found.)
		const [myX, myY] = this.GetPosition();
		this.#waypoints = await this.GetGameServer().GetPathfinding().FindPath(myX, myY, x, y);
	}
	
	Tick(dt)
	{
		// moveState is an empty string while not moving. If it's set to
		// anything, then call #TickMovement() to handle the movement.
		if (this.#moveState)
		{
			this.#TickMovement(dt);
		}
	}
	
	#TickMovement(dt)
	{
		// Call different methods depending on the move state.
		// Note else-if is not used as the move state is allowed to fall through
		// to the next state in the same tick.
		
		// The first move state is "stopping", which just brings the unit to a stop
		// if it is already moving when MoveToPosition() is called.
		if (this.#moveState === "stopping")
		{
			this.#TickStateStopping();
		}
		
		// The second move state is "rotate-first". This will rotate the unit to
		// point towards its first waypoint while it is stopped.
		if (this.#moveState === "rotate-first")
		{
			this.#TickStateRotateFirst(dt);
		}
		
		// The third move state is "moving", in which it is assumed to be now
		// pointing at its target and so it will accelerate towards it, and brake
		// when getting close to the destination.
		if (this.#moveState === "moving")
		{
			this.#TickStateMoving();
		}
		
		// Always call #TickApplyMovement() as that applies acceleration
		// and moves the platform at its current speed.
		this.#TickApplyMovement(dt);
	}
	
	// Bring the unit to a stop if it is already moving.
	#TickStateStopping()
	{
		if (this.GetSpeed() > 0)
		{
			// Brake until stopped.
			this.SetAcceleration(-this.#maxAcceleration);
		}
		else
		{
			// Unit is at a stop. Proceed to next move state.
			this.SetAcceleration(0);
			this.SetSpeed(0);
			this.#moveState = "rotate-first";
		}
	}
	
	// Rotate the unit to point at its first waypoint.
	#TickStateRotateFirst(dt)
	{
		// If pathfinding failed, then the waypoints will be set to null. In this case
		// cancel movement, returning the move state to not moving.
		if (this.#waypoints === null)
		{
			this.#moveState = "";
			return;
		}
		
		// While the pathfinding result is not yet ready, the waypoints will be an empty
		// array. In this case just wait until the pathfinding result comes in and fills
		// the waypoints array.
		if (this.#waypoints.length === 0)
		{
			return;
		}
		
		// Get current position and first waypoint position.
		const [currentX, currentY] = this.GetPosition();
		const [curTargetX, curTargetY] = this.#waypoints[0];
		
		// Get current angle and the angle to the first waypoint.
		const currentAngle = this.GetAngle();
		const targetAngle = MathUtils.AngleTo(currentX, currentY, curTargetX, curTargetY);
		
		// If the unit is facing in the right direction, proceed to the next move state.
		// Note a small angular difference is allowed in order to avoid floating point
		// precision errors counting as not being in the right direction.
		if (MathUtils.AngleDifference(targetAngle, currentAngle) < MathUtils.ToRadians(0.01))
		{
			this.#moveState = "moving";
		}
		else
		{
			// While not facing in the right direction, rotate towards the target angle.
			this.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, this.#rotateSpeed * dt));
		}
	}
	
	// Accelerate the unit towards its next waypoint, and brake when it is close to its destination.
	#TickStateMoving()
	{
		// Get current position and next waypoint position.
		const [currentX, currentY] = this.GetPosition();
		const [curTargetX, curTargetY] = this.#waypoints[0];
		
		// Find the square distance to the target (avoiding the need to calculate a square root).
		const sqDistToTarget = MathUtils.DistanceSquared(currentX, currentY, curTargetX, curTargetY);
		
		// Calculate the stopping distance, which is the distance the unit will stop in when
		// travelling at its maximum speed and applying its maximum deceleration.
		const stoppingDist = 0.5 * this.#maxSpeed * this.#maxSpeed / this.#maxDeceleration;

		// If the unit is within the stopping distance of its target, then calculate a new
		// maximum speed based on how much it needs to have slowed down to stop.
		let curMaxSpeed = this.#maxSpeed;
		if (sqDistToTarget <= stoppingDist * stoppingDist)
		{
			// Now we need the real distance to the target, so take the square root.
			const distToTarget = Math.sqrt(sqDistToTarget);
			curMaxSpeed = Math.sqrt(2 * this.#maxDeceleration * distToTarget);
		}
		
		// Accelerate or brake according to whether the unit is under or over the current
		// allowed maximum speed.  If it's exactly at the maximum speed, set the acceleration
		// to 0, so clients don't keep trying to accelerate units travelling at max speed.
		if (this.GetSpeed() < curMaxSpeed)
			this.SetAcceleration(this.#maxAcceleration);
		else if (this.GetSpeed() > curMaxSpeed)
			this.SetAcceleration(-this.#maxDeceleration);
		else
			this.SetAcceleration(0);

		// Also update the angle directly to the target to correct any small rounding errors.
		// This will only perform a small correction so is unlikely to be visible to players.
		this.SetAngle(MathUtils.AngleTo(currentX, currentY, curTargetX, curTargetY));
	}
	
	#TickApplyMovement(dt)
	{
		// Adjust the speed according to the acceleration.
		const acceleration = this.GetAcceleration();
		if (acceleration !== 0)
		{
			this.SetSpeed(this.GetSpeed() + acceleration * dt, 0);
		}

		// If moving, apply the movement at the current speed.
		if (this.GetSpeed() !== 0)
		{
			// Calculate the distance to move this tick. Note this also takes in to account
			// the current acceleration, but the acceleration must not allow the movement to
			// exceed the maximum speed or go negative.
			const moveDist = MathUtils.Clamp(this.GetSpeed() * dt + 0.5 * acceleration * dt * dt,
											 0, this.#maxSpeed * dt);
			
			// Check if we've arrived, which is when the target position is nearer than the
			// distance to move. Note this compares squared distances so there doesn't have
			// to be an expensive square root calculation.
			const hasTarget = (this.#waypoints && this.#waypoints.length > 0);
			const [currentX, currentY] = this.GetPosition();
			const [curTargetX, curTargetY] = (hasTarget ? this.#waypoints[0] : [0, 0]);
			const sqDistToTarget = MathUtils.DistanceSquared(currentX, currentY, curTargetX, curTargetY);
		
			if (hasTarget && moveDist * moveDist >= sqDistToTarget)
			{
				// Arrived at the target position. Remove the waypoint from the list.
				this.#waypoints.shift();
				
				// If this was the last waypoint, then set the final position,
				// bring the unit to a complete halt, and stop movement.
				if (this.#waypoints.length === 0)
				{
					this.SetPosition(curTargetX, curTargetY);
					this.SetSpeed(0);
					this.SetAcceleration(0);
					this.#moveState = "";
				}
				else
				{
					// Otherwise proceeding to the next waypoint.
					// Start the movement process from the beginning again.
					// (TODO: improve this algorithm)
					this.#moveState = "stopping";
				}
			}
			else
			{
				// Not yet arrived: advance by the move distance on the current angle.
				const a = this.GetAngle();
				const dx = Math.cos(a) * moveDist;
				const dy = Math.sin(a) * moveDist;
				this.SetPosition(currentX + dx, currentY + dy);
			}
		}

		// Once the unit comes to a stop - i.e. the first time the speed reaches 0 after
		// not being 0 - send position and speed delta updates. This ensures the client
		// can correct the resting position of the unit as quickly as possible, since
		// predicting deceleration is tricky. Note that the acceleration being set to 0
		// will already send a delta update for the acceleration change.
		if (this.GetSpeed() === 0 && this.#lastSpeed !== 0)
		{
			this.GetUnit().MarkPositionDelta();
			this.GetUnit().MarkPlatformSpeedChanged();
		}

		this.#lastSpeed = this.GetSpeed();
	}
	
	ContainsPoint(x, y)
	{
		// The base class ContainsPoint() method checks the point relative to the origin.
		// So first translate the point to be relative to the unit position.
		const [myX, myY] = this.GetPosition();
		return super.ContainsPoint(x - myX, y - myY);
	}
}