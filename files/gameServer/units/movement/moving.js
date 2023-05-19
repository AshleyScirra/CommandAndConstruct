import { UnitMovementState } from "./unitMovementState.js";

import * as MathUtils from "../../utils/mathUtils.js";

// UnitMovementStateMoving manages the "moving" state for UnitMovementController.
// This manages moving the unit along the sequence of waypoints found by pathfinding.
// This state is only reached after "stopping" and "rotate-first", so the unit is
// stopped and pointing in the direction of the first waypoint when reaching this state.
export class UnitMovementStateMoving extends UnitMovementState {

	#curMaxSpeed = 0;		// Temporary maximum speed restriction
	#targetSpeed = 0;		// Current speed to accelerate or brake towards
	
	constructor(controller)
	{
		super(controller);
		
		// Set debug state 3 for "moving"
		this.SetUnitDebugState(3);
	}
	
	Tick(dt)
	{
		const controller = this.GetController();
		const unitPlatform = this.GetUnitPlatform();
		
		// Approaching the last waypoint is managed differently, as the unit will brake and
		// come to a halt at the last waypoint, whereas for other waypoints it will turn ahead
		// of the waypoint to cut the corner rather than overshoot.
		if (this.GetWaypoints().length === 1)
		{
			this.#TickLastWaypoint(dt);
		}
		else
		{
			this.#TickMoreWaypoints(dt);
		}
		
		// Step the movement with the current target speed. However if it hits something,
		// put it back to its original position (so it doesn't move). TODO: react to being
		// blocked somehow!
		const startingPosition = unitPlatform.SavePosition();
		
		controller.StepMovement(dt, this.#targetSpeed);
		
		if (unitPlatform.IntersectsAnyOther())
		{
			unitPlatform.RestorePosition(startingPosition);
			unitPlatform.SetSpeed(0);
			this.GetUnit().MarkPositionDelta();
		}
	}
	
	#TickMoreWaypoints(dt)
	{
		const unitPlatform = this.GetUnitPlatform();
		const waypoints = this.GetWaypoints();
		
		// Get current position, the current waypoint position, and the following waypoint
		// position after that.
		const [currentX, currentY] = unitPlatform.GetPosition();
		const [curTargetX, curTargetY] = waypoints[0];
		const [nextTargetX, nextTargetY] = waypoints[1];
		
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
			waypoints.shift();
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
		const turnCircleRadius = unitPlatform.GetSpeed() / unitPlatform.GetRotateSpeed();
		
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
			const slowSpeed = slowTurnCircleRadius * unitPlatform.GetRotateSpeed();
			
			// Determine the distance the unit will take to brake from its maximum speed to the
			// lower speed. Add on to that the turn distance, resulting in the overall distance
			// from the next waypoint at which the unit must use a reduced speed.
			const speedDiff = unitPlatform.GetMaxSpeed() - slowSpeed;
			const slowdownDist = turnDist + 0.5 * speedDiff * speedDiff / unitPlatform.GetMaxDeceleration();
			
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
		const minMoveDist = unitPlatform.GetSpeed() * dt * 2;
		if (sqDistToTarget <= Math.max(turnDist * turnDist,	
									   minMoveDist * minMoveDist,
									   10 * 10))
		{
			waypoints.shift();
		}
	}
	
	#TickLastWaypoint(dt)
	{
		const unitPlatform = this.GetUnitPlatform();
		const waypoints = this.GetWaypoints();
		
		// Get current position and final waypoint position.
		const [currentX, currentY] = unitPlatform.GetPosition();
		const [curTargetX, curTargetY] = waypoints[0];
		
		// Find the square distance to the target (avoiding the need to calculate a square root).
		const sqDistToTarget = MathUtils.DistanceSquared(currentX, currentY, curTargetX, curTargetY);
		
		// Check if we've arrived, which is when the target position is nearer than the
		// distance to move at the current speed, or at least 2px.
		const moveDist = Math.max(unitPlatform.GetSpeed() * dt, 2);
		if (moveDist * moveDist >= sqDistToTarget)
		{
			// Arrived at the target position. Remove the waypoint from the list.
			waypoints.shift();

			// That was the last waypoint, so set the final position,
			// bring the unit to a complete halt, and stop movement.
			unitPlatform.SetPosition(curTargetX, curTargetY);
			unitPlatform.SetSpeed(0);
			unitPlatform.SetAcceleration(0);
			this.GetController().SetNextState("released");
			this.#targetSpeed = 0;
			this.#ResetCurMaxSpeed();
			return;
		}
		
		// Not yet arrived at target position.
		// Calculate the stopping distance, which is the distance the unit will stop in when
		// travelling at its maximum speed and applying its maximum deceleration.
		const maxSpeed = unitPlatform.GetMaxSpeed();
		const maxDeceleration = unitPlatform.GetMaxDeceleration();
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
		const unitPlatform = this.GetUnitPlatform();
		
		const currentAngle = unitPlatform.GetAngle();
		const angleDiff = MathUtils.AngleDifference(targetAngle, currentAngle);
		if (angleDiff < MathUtils.ToRadians(0.01))
		{
			// Near enough directly on target. Remove any speed restriction and
			// set to the exact target angle.
			this.#ResetCurMaxSpeed();
			unitPlatform.SetAngle(targetAngle);
		}
		else	// not yet on target
		{
			// Check to see if the target is beyond the unit's turn circle.
			// Find how long the unit will take to rotate to its target angle,
			// and then how far it will travel at its current speed in that time.
			const rotateSpeed = unitPlatform.GetRotateSpeed();
			const rotateTime = angleDiff / rotateSpeed;
			const travelDist = unitPlatform.GetSpeed() * rotateTime;
			
			// If the unit would travel further than the distance to the target in
			// this time, then it may not be able to reach it with its turn circle,
			// so come to a halt and start over.
			if (travelDist * travelDist > sqDistToTarget)
			{
				this.GetController().SetNextState("stopping");
			}
			else
			{
				// Otherwise just rotate towards the target angle.
				// However if this causes the unit to collide with another one, then revert
				// back to the starting angle.
				unitPlatform.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, rotateSpeed * dt));
				
				if (unitPlatform.IntersectsAnyOther())
				{
					this.#ResetCurMaxSpeed();	// allow accelerating to try to drive past obstacle
					unitPlatform.SetAngle(currentAngle);
				}
			}
		}
	}
	
	// A lower maximum speed can be imposed while maneuvering. Resetting it
	// puts the current maximum speed at the highest allowed value.
	#ResetCurMaxSpeed()
	{
		this.#curMaxSpeed = this.GetUnitPlatform().GetMaxSpeed();
	}
}