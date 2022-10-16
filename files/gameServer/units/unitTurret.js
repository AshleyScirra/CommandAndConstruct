
import { PositionedAndAngledObject } from "../classes/positionedAndAngledObject.js";
import * as MathUtils from "../utils/mathUtils.js";

// A UnitTurret is the firing part of a unit, that rotates independently of the platform
// to aim and fire projectiles at other player's units.
// Note that importantly the UnitTurret position and angle are treated as offsets
// from the platform. That means when the platform moves and rotates, the turret
// automatically moves and rotates with it.
export class UnitTurret extends PositionedAndAngledObject {

	// Private fields
	#unit;					// reference to Unit
	#targetUnitId = -1;		// ID of unit turret is targeting, or -1 if none
	
	#range = 1000;			// maximum range to identify a target
	#rotateSpeed = MathUtils.ToRadians(70);
	
	constructor(unit, x, y)
	{
		super(unit.GetGameServer(), x, y);
		
		this.#unit = unit;
	}
	
	GetUnit()
	{
		return this.#unit;
	}
	
	GetPlatform()
	{
		return this.GetUnit().GetPlatform();
	}
	
	Tick(dt)
	{
		if (this.#targetUnitId === -1)
			this.#FindTarget(dt);
		else
			this.#TrackTarget(dt);
	}
	
	// Identify if there is a unit this turret can target in range.
	#FindTarget(dt)
	{
		const forPlayer = this.GetUnit().GetPlayer();
		const [fromX, fromY] = this.GetPlatform().GetTurretPosition();
		
		// This uses a brute-force approach iterating all units.
		// TODO: make this more efficient so it can scale for 1000s of units.
		for (const unit of this.GetGameServer().allUnits())
		{
			// Skip units from the same player
			if (unit.GetPlayer() === forPlayer)
				continue;
			
			// Check if this unit is within range.
			// Use square distances to avoid computing a square root.
			const [toX, toY] = unit.GetPlatform().GetPosition();
			const dx = toX - fromX;
			const dy = toY - fromY;
			if (dx * dx + dy * dy <= this.#range * this.#range)
			{
				// Found a target. Save its ID and return.
				this.#targetUnitId = unit.GetId();
				return;
			}
		}
		
		// Did not find a target. Rotate the turret back to angle 0,
		// so it returns to its default orientation with the unit platform.
		this.SetAngle(MathUtils.AngleRotate(this.GetAngle(), 0, this.#rotateSpeed * dt));
	}
	
	#TrackTarget(dt)
	{
		// Find the unit this turret is tracking.
		const unit = this.GetGameServer().GetUnitById(this.#targetUnitId);
		
		// If the unit is not found, assume it was destroyed.
		// Reset to having no target and bail out.
		if (!unit)
		{
			this.#targetUnitId = -1;
			return;
		}
		
		// Check the target is still in range.
		const [myX, myY] = this.GetPlatform().GetTurretPosition();
		const [targetX, targetY] = unit.GetPlatform().GetPosition();
		const dx = targetX - myX;
		const dy = targetY - myY;
		if (dx * dx + dy * dy > this.#range * this.#range)
		{
			this.#targetUnitId = -1;
			return;
		}
		
		// Get the angle to the target
		const targetAngle = MathUtils.AngleTo(myX, myY, targetX, targetY);
		
		// Rotate towards the target. Note that the angle rotation is done in terms
		// of the overall angle, but the turret angle is set to an angle relative
		// to the platform angle.
		const platformAngle = this.GetPlatform().GetAngle();
		const myAngle = platformAngle + this.GetAngle();
		const rotatedAngle = MathUtils.AngleRotate(myAngle, targetAngle, this.#rotateSpeed * dt);
		this.SetAngle(rotatedAngle - platformAngle);
	}
}