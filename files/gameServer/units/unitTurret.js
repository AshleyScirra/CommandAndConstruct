
import { PositionedAndAngledObject } from "../classes/positionedAndAngledObject.js";

// A UnitTurret is the firing part of a unit, that rotates independently of the platform
// to aim and fire projectiles at other player's units.
// Note that importantly the UnitTurret position and angle are treated as offsets
// from the platform. That means when the platform moves and rotates, the turret
// automatically moves and rotates with it.
export class UnitTurret extends PositionedAndAngledObject {

	// Private fields
	#unit;			// reference to Unit
	
	constructor(unit)
	{
		super(unit.GetGameServer(), 0, 0);
		
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
		// override
	}
}