
import { CollisionShape } from "../collisions/collisionShape.js";
import { CollisionBox } from "../collisions/collisionBox.js";

// A UnitPlatform is the bottom part of a unit, such as the driving part of a tank,
// or the platform of a static turret emplacement. It could also be referred to as the
// unit base, but that would probably be confusing with the term "base class".
export class UnitPlatform {

	// Private fields
	#unit;					// reference to Unit
	#objectData;			// reference to ObjectData for this platform
	#collisionShape;		// reference to CollisionShape for collision detection
	#collisionBox;			// the collision box for the collision grid
	
	constructor(unit, objectData)
	{
		const gameServer = unit.GetGameServer();
		
		this.#unit = unit;
		this.#objectData = objectData;
		this.#collisionShape = new CollisionShape(gameServer, objectData);
		this.#collisionBox = new CollisionBox(gameServer, this);
	}
	
	Release()
	{
		// When releasing a platform (because the unit was destroyed), release the
		// collision box, so it is also removed from any collision cells it was in.
		this.#collisionBox.Release();
	}
	
	GetUnit()
	{
		return this.#unit;
	}
	
	GetGameServer()
	{
		return this.GetUnit().GetGameServer();
	}
	
	// Handling collisions requires knowing the position and angle. Use default stub methods
	// which are overridden by MovableUnitPlatform.
	GetPosition()
	{
		return [0, 0];
	}
	
	GetAngle()
	{
		return 0;
	}
	
	Tick(dt)
	{
		// override
	}
	
	// Called when the position or angle changes, which affects how collisions work.
	UpdateCollision()
	{
		// If necessary update the collision shape to reflect the new angle.
		// If the angle hasn't really changed this call will be ignored.
		this.#collisionShape.Update(this.GetAngle());
		
		// Moving or rotating the platform could affect which collision cells
		// it is in, so recalculate its collision box in layout co-ordinates,
		// and update the collision box to that rectangle.
		const [x, y] = this.GetPosition();
		const [left, top, right, bottom] = this.#collisionShape.GetBox();
		
		this.#collisionBox.Update(x + left, y + top, x + right, y + bottom);
	}
	
	// Check if a given point - relative to the origin - is inside the collision shape
	// for this platform.
	ContainsPoint(x, y)
	{
		return this.#collisionShape.ContainsPoint(x, y);
	}
}