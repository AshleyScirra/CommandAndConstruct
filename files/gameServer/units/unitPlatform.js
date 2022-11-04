
import { CollisionShape } from "../classes/collisionShape.js";

// A UnitPlatform is the bottom part of a unit, such as the driving part of a tank,
// or the platform of a static turret emplacement. It could also be referred to as the
// unit base, but that would probably be confusing with the term "base class".
export class UnitPlatform {

	// Private fields
	#unit;					// reference to Unit
	#objectData;			// reference to ObjectData for this platform
	#collisionShape;		// reference to CollisionShape for collision detection
	
	constructor(unit, objectData)
	{
		this.#unit = unit;
		this.#objectData = objectData;
		this.#collisionShape = new CollisionShape(unit.GetGameServer(), objectData);
	}
	
	GetUnit()
	{
		return this.#unit;
	}
	
	GetGameServer()
	{
		return this.GetUnit().GetGameServer();
	}
	
	// Collision checks require knowing the platform angle. Provide a default GetAngle()
	// method that just returns 0 so an angle can always be retrieved. MovableUnitPlatform
	// overrides this method to return the platform angle.
	GetAngle()
	{
		return 0;
	}
	
	Tick(dt)
	{
		// override
	}
	
	// Check if a given point - relative to the origin - is inside the collision shape
	// for this platform.
	ContainsPoint(x, y)
	{
		// First update the collision shape to the current angle, if necessary.
		this.#collisionShape.Update(this.GetAngle());
		
		return this.#collisionShape.ContainsPoint(x, y);
	}
}