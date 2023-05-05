import * as MathUtils from "../../utils/mathUtils.js";

// UnitMovementController manages the movement of a MovableUnitPlatform along a path.
export class UnitMovementController {

	#unitPlatform;			// MovableUnitPlatform this controller is managing
	
	#moveState = "";		// String of current movement state
	#waypoints = null;		// Remaining list of positions to move to
	
	#curMaxSpeed = 0;		// Temporary maximum speed restriction
	#targetSpeed = 0;		// Current speed to accelerate or brake towards

	constructor(unitPlatform)
	{
		this.#unitPlatform = unitPlatform;
		
		this.#ResetCurMaxSpeed();
	}
	
	Release()
	{
		this.#moveState = "released";
		this.#unitPlatform = null;
		this.#waypoints = null;
	}
	
	GetUnit()
	{
		return this.#unitPlatform.GetUnit();
	}
	
	Stop()
	{
		this.#moveState = "stopping";
		this.#waypoints = [];
		this.#ResetCurMaxSpeed();
	}
	
	StartMovingAlongWaypoints(waypoints)
	{
		this.#waypoints = waypoints;
		this.#moveState = "stopping";
	}
	
	TickMovement(dt)
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
			// Moving to the last waypoint is handled specially.
			if (this.#waypoints.length === 1)
			{
				this.#TickStateMoving_LastWaypoint(dt);
			}
			// Otherwise handle moving to a waypoint when there is at
			// least one more waypoint after that.
			else
			{
				this.#TickStateMoving_MoreWaypoints(dt);
			}
		}
		
		// Always call #TickApplyMovement() as that applies acceleration
		// and moves the platform at its current speed.
		this.#TickApplyMovement(dt);
		
		// When movement is done, the state is set to "releasing" so the movement controller
		// is released here at the end of the tick. Note it isn't released immediately as
		// it can fall through to do other work on the final tick of movement, and it avoids
		// having to handle special cases of the class being released half-way through ticking.
		if (this.#moveState === "releasing")
		{
			this.#unitPlatform.ReleaseMovementController();
		}
	}
	
	// Bring the unit to a stop if it is already moving.
	#TickStateStopping()
	{
		this.#ResetCurMaxSpeed();
		this.#targetSpeed = 0;
		
		// Unit has come to a stop
		if (this.#unitPlatform.GetSpeed() === 0)
		{
			// If there is no path, then release the movement controller as there is
			// nothing else to do. (If a path is found the unit will create a new controller.)
			if (this.#waypoints.length === 0)
			{
				this.#moveState = "releasing";
			}
			else
			{
				// Otherwise a path has been found, so proceed to next move state.
				this.#unitPlatform.SetAcceleration(0);
				this.#unitPlatform.SetSpeed(0);
				this.#moveState = "rotate-first";
			}
		}
	}
	
	// Rotate the unit to point at its first waypoint.
	#TickStateRotateFirst(dt)
	{
		this.#ResetCurMaxSpeed();
		this.#targetSpeed = 0;
		
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
		const [currentX, currentY] = this.#unitPlatform.GetPosition();
		const [curTargetX, curTargetY] = this.#waypoints[0];
		
		// Get current angle and the angle to the first waypoint.
		const currentAngle = this.#unitPlatform.GetAngle();
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
			this.#unitPlatform.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, this.#unitPlatform.GetRotateSpeed() * dt));
		}
	}
	
	// When moving towards waypoints, rotates the unit towards the target angle.
	// However this also has two additional purposes:
	// 1) once it's pointing at the target angle, any temporary speed limit is lifted,
	//    allowing it to accelerate back to full speed once it's back on track.
	// 2) if the unit cannot reach the target angle because it's inside its turn circle,
	//    then revert back to "stopping" state. This will bring the unit to a halt, point
	//    directly towards the waypoint, and then start accelerating towards it again,
	//    avoiding the problem of units circling endlessly around targets they can't reach.
	//    This is only used when moving towards the final waypoint, as other waypoints along
	//    the way are often deliberately cut off by the turn circle.
	#RotateTowardsAngle(targetAngle, dt, sqDistToTarget = Infinity)
	{
		const currentAngle = this.#unitPlatform.GetAngle();
		const angleDiff = MathUtils.AngleDifference(targetAngle, currentAngle);
		if (angleDiff < MathUtils.ToRadians(0.01))
		{
			// Near enough directly on target. Remove any speed restriction and
			// set to the exact target angle.
			this.#ResetCurMaxSpeed();
			this.#unitPlatform.SetAngle(targetAngle);
		}
		else	// not yet on target
		{
			// Check to see if the target is beyond the unit's turn circle.
			// Find how long the unit will take to rotate to its target angle,
			// and then how far it will travel at its current speed in that time.
			const rotateSpeed = this.#unitPlatform.GetRotateSpeed();
			const rotateTime = angleDiff / rotateSpeed;
			const travelDist = this.#unitPlatform.GetSpeed() * rotateTime;
			
			// If the unit would travel further than the distance to the target in
			// this time, then it may not be able to reach it with its turn circle,
			// so come to a halt and start over.
			if (travelDist * travelDist > sqDistToTarget)
			{
				this.#moveState = "stopping";
			}
			else
			{
				// Otherwise just rotate towards the target angle.
				this.#unitPlatform.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, rotateSpeed * dt));
			}
		}
	}
	
	// Unit is moving towards a waypoint with at least one more waypoint following.
	#TickStateMoving_MoreWaypoints(dt)
	{
		// Get current position, the current waypoint position, and the following waypoint
		// position after that.
		const [currentX, currentY] = this.#unitPlatform.GetPosition();
		const [curTargetX, curTargetY] = this.#waypoints[0];
		const [nextTargetX, nextTargetY] = this.#waypoints[1];
		
		// Find square distance to current waypoint.
		const sqDistToTarget = MathUtils.DistanceSquared(currentX, currentY, curTargetX, curTargetY);
		
		// Find the angle to the current waypoint, and the angle from the current waypoint
		// to the next waypoint.
		const targetAngle = MathUtils.AngleTo(currentX, currentY, curTargetX, curTargetY);
		const nextAngle = MathUtils.AngleTo(curTargetX, curTargetY, nextTargetX, nextTargetY);
		
		// If the angle towards the current waypoint, and the angle to the next waypoint, are almost
		// exactly in a straight line (based on the angle difference being under 2 degrees), remove
		// the next waypoint early. In this case the next waypoint is basically redundant. This also
		// avoids trying to calculate the turn circle for an almost straight line, which results in
		// calculating a tiny or non-finite turn distance. This helps with the first waypoint sometimes
		// forming a straight line between the unit and the next waypoint, and may also happen while
		// units turn between waypoints.
		if (MathUtils.AngleDifference(targetAngle, nextAngle) < MathUtils.ToRadians(2))
		{
			this.#waypoints.shift();
			return;
		}
		
		// Rotate towards the target angle.
		// Note this removes any temporary speed restriction if the unit is on target.
		this.#RotateTowardsAngle(targetAngle, dt);
		
		// Find the difference between the angle from the current waypoint back to the unit,
		// and the angle from the current waypoint to the next waypoint.
		// This is the angle within which the turn circle must fit.
		const waypointAngleDiff = MathUtils.AngleDifference(targetAngle + Math.PI, nextAngle);
		
		// Find the radius of the turn circle at the current speed.
		const turnCircleRadius = this.#unitPlatform.GetSpeed() / this.#unitPlatform.GetRotateSpeed();
		
		// Find the distance from the current waypoint at which the unit can begin to turn
		// early given its current turn circle.
		const tanHalfDiff = Math.tan(waypointAngleDiff / 2);
		const turnDistCurSpeed = turnCircleRadius / tanHalfDiff;
		let turnDist = turnDistCurSpeed;
		
		// If the turn circle distance is more than half the distance to the next waypoint,
		// it is probably going to overshoot the next waypoint too badly and so must slow down.
		// Using the half distance as the limit of the turn circle, the calculation can then
		// be done in reverse to establish the maximum allowed speed to perform a turn that
		// will leave it at the right angle half-way to the next waypoint.
		const nextWaypointDist = MathUtils.DistanceTo(curTargetX, curTargetY, nextTargetX, nextTargetY)
		if (turnDistCurSpeed > nextWaypointDist / 2)
		{
			// The early turn distance is now set to half the distance to the next waypoint,
			// which is less than the previous turn distance.
			turnDist = nextWaypointDist / 2;
			
			// Now calculate the slower speed from the new reduced turn distance.
			const slowTurnCircleRadius = turnDist * tanHalfDiff;
			const slowSpeed = slowTurnCircleRadius * this.#unitPlatform.GetRotateSpeed();
			
			// Determine the distance the unit will take to brake from its maximum speed to the
			// lower speed. Add on to that the turn distance, resulting in the overall distance
			// from the next waypoint at which the unit must use a reduced speed.
			const speedDiff = this.#unitPlatform.GetMaxSpeed() - slowSpeed;
			const slowdownDist = turnDist + 0.5 * speedDiff * speedDiff / this.#unitPlatform.GetMaxDeceleration();
			
			// If the unit is within this reduced speed limit range, then impose a temporary
			// speed limit of the slow speed. This must remain even after it starts to move to
			// the next waypoint, so the speed limit is only lifted once it is pointing directly
			// at its current waypoint, via #ResetCurMaxSpeed().
			if (sqDistToTarget <= slowdownDist * slowdownDist)
			{
				this.#curMaxSpeed = slowSpeed;
			}
		}
		
		// Aim to go as fast as allowed.
		this.#targetSpeed = this.#curMaxSpeed;
		
		// If the unit is within the early turn range, then switch to the next waypoint
		// so it can begin to turn towards it.
		// As a fail-safe against calculating a tiny turn circle distance, switch to the
		// next waypoint when within range of whichever is largest:
		// 1) the calculated turn circle distance
		// 2) the distance travelled in 2 ticks at the current speed
		// 2) 10 pixels
		const minMoveDist = this.#unitPlatform.GetSpeed() * dt * 2;
		if (sqDistToTarget <= Math.max(turnDist * turnDist,	
									   minMoveDist * minMoveDist,
									   10 * 10))
		{
			this.#waypoints.shift();
		}
	}
	
	// Unit is moving towards its last waypoint.
	#TickStateMoving_LastWaypoint(dt)
	{
		// Get current position and final waypoint position.
		const [currentX, currentY] = this.#unitPlatform.GetPosition();
		const [curTargetX, curTargetY] = this.#waypoints[0];
		
		// Find the square distance to the target (avoiding the need to calculate a square root).
		const sqDistToTarget = MathUtils.DistanceSquared(currentX, currentY, curTargetX, curTargetY);
		
		// Check if we've arrived, which is when the target position is nearer than the
		// distance to move at the current speed, or at least 2px.
		const moveDist = Math.max(this.#unitPlatform.GetSpeed() * dt, 2);
		if (moveDist * moveDist >= sqDistToTarget)
		{
			// Arrived at the target position. Remove the waypoint from the list.
			this.#waypoints.shift();

			// That was the last waypoint, so set the final position,
			// bring the unit to a complete halt, and stop movement.
			this.#unitPlatform.SetPosition(curTargetX, curTargetY);
			this.#unitPlatform.SetSpeed(0);
			this.#unitPlatform.SetAcceleration(0);
			this.#moveState = "releasing";
			this.#targetSpeed = 0;
			this.#ResetCurMaxSpeed();
			return;
		}
		
		// Not yet arrived at target position.
		// Calculate the stopping distance, which is the distance the unit will stop in when
		// travelling at its maximum speed and applying its maximum deceleration.
		const maxSpeed = this.#unitPlatform.GetMaxSpeed();
		const maxDeceleration = this.#unitPlatform.GetMaxDeceleration();
		const stoppingDist = 0.5 * maxSpeed * maxSpeed / maxDeceleration;

		// If the unit is within the stopping distance of its target, then calculate a new
		// maximum speed based on how much it needs to have slowed down to stop.
		let stoppingMaxSpeed = maxSpeed;
		if (sqDistToTarget <= stoppingDist * stoppingDist)
		{
			// Now we need the real distance to the target, so take the square root.
			const distToTarget = Math.sqrt(sqDistToTarget);
			stoppingMaxSpeed = Math.sqrt(2 * maxDeceleration * distToTarget);
		}

		// Also update the angle. This allows the unit to rotate towards the target position
		// if it's not already pointing in the right direction, but also allows the angle to
		// be corrected over time as it moves in a straight line, as floating point precision
		// errors may mean the angle is not calculated perfectly.
		const targetAngle = MathUtils.AngleTo(currentX, currentY, curTargetX, curTargetY);
		this.#RotateTowardsAngle(targetAngle, dt, sqDistToTarget);
		
		// Accelerate or brake towards the current maximum speed.
		this.#targetSpeed = Math.min(this.#curMaxSpeed, stoppingMaxSpeed);
	}
	
	#TickApplyMovement(dt)
	{
		// Accelerate or brake according to whether the unit is under or over the target speed.
		// If it's exactly at the target speed, set the acceleration to 0, so clients don't keep
		// trying to apply acceleration.
		if (this.#unitPlatform.GetSpeed() < this.#targetSpeed)
			this.#unitPlatform.SetAcceleration(this.#unitPlatform.GetMaxAcceleration());
		else if (this.#unitPlatform.GetSpeed() > this.#targetSpeed)
			this.#unitPlatform.SetAcceleration(-this.#unitPlatform.GetMaxDeceleration());
		else
			this.#unitPlatform.SetAcceleration(0);
		
		// Adjust the speed according to the acceleration.
		const acceleration = this.#unitPlatform.GetAcceleration();
		if (acceleration !== 0)
		{
			// End on the exact target speed if the change in acceleration would reach it.
			const speedChange = acceleration * dt;
			if (Math.abs(this.#unitPlatform.GetSpeed() - this.#targetSpeed) <= speedChange)
			{
				this.#unitPlatform.SetSpeed(this.#targetSpeed);
			}
			else
			{
				this.#unitPlatform.SetSpeed(this.#unitPlatform.GetSpeed() + acceleration * dt);
			}
		}

		// If moving, apply the movement at the current speed.
		if (this.#unitPlatform.GetSpeed() !== 0)
		{
			// Calculate the distance to move this tick. Note this also takes in to account
			// the current acceleration, but the acceleration must not allow the movement to
			// exceed the maximum speed or go negative.
			const moveDist = MathUtils.Clamp(this.#unitPlatform.GetSpeed() * dt + 0.5 * acceleration * dt * dt,
											 0, this.#unitPlatform.GetMaxSpeed() * dt);
			
			// Advance by the move distance on the current angle.
			const [currentX, currentY] = this.#unitPlatform.GetPosition();
			const a = this.#unitPlatform.GetAngle();
			const dx = Math.cos(a) * moveDist;
			const dy = Math.sin(a) * moveDist;
			this.#unitPlatform.SetPosition(currentX + dx, currentY + dy);
		}

		// Once the unit comes to a stop - i.e. the first time the speed reaches 0 after
		// not being 0 - send position and speed delta updates. This ensures the client
		// can correct the resting position of the unit as quickly as possible, since
		// predicting deceleration is tricky. Note that the acceleration being set to 0
		// will already send a delta update for the acceleration change.
		if (this.#unitPlatform.GetSpeed() === 0 && this.#unitPlatform.GetLastSpeed() !== 0)
		{
			this.GetUnit().MarkPositionDelta();
			this.GetUnit().MarkPlatformSpeedChanged();
		}
	}
	
	// A lower maximum speed can be imposed while maneuvering. Resetting it
	// puts the current maximum speed at the highest allowed value.
	#ResetCurMaxSpeed()
	{
		this.#curMaxSpeed = this.#unitPlatform.GetMaxSpeed();
	}
}