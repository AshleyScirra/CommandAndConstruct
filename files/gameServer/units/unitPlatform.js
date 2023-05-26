
import { CollisionShape } from "../collisions/collisionShape.js";
import { CollisionBox } from "../collisions/collisionBox.js";

// A UnitPlatform is the bottom part of a unit, such as the driving part of a tank,
// or the platform of a static turret emplacement. It could also be referred to as the
// unit base, but that would probably be confusing with the term "base class".
export class UnitPlatform {

	// Private fields
	#unit;						// reference to Unit
	#objectData;				// reference to ObjectData for this platform
	#fullCollisionShape;		// reference to CollisionShape for full collision detection
	#obstacleCollisionShape;	// reference to CollisionShape for obstacle collision detection
	#collisionBox;				// the collision box for the collision grid
	
	constructor(unit, objectData)
	{
		const gameServer = unit.GetGameServer();
		
		this.#unit = unit;
		this.#objectData = objectData;
		this.#fullCollisionShape = new CollisionShape(gameServer, objectData.GetFullCollisionPoly());
		this.#obstacleCollisionShape = new CollisionShape(gameServer, objectData.GetObstacleCollisionPoly());
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
	
	GetFullCollisionShape()
	{
		return this.#fullCollisionShape;
	}
	
	GetObstacleCollisionShape()
	{
		return this.#obstacleCollisionShape;
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
		this.#fullCollisionShape.Update(this.GetAngle());
		this.#obstacleCollisionShape.Update(this.GetAngle());
		
		// Moving or rotating the platform could affect which collision cells
		// it is in, so recalculate its collision box in layout co-ordinates,
		// and update the collision box to that rectangle.
		const [x, y] = this.GetPosition();
		const [left, top, right, bottom] = this.#fullCollisionShape.GetBox();
		
		this.#collisionBox.Update(x + left, y + top, x + right, y + bottom);
	}
	
	// Check if a given point - relative to the origin - is inside the a collision shape
	// for this platform. There are separate methods for both the full and obstacle shapes.
	ContainsPoint_Full(x, y)
	{
		return this.#fullCollisionShape.ContainsPoint(x, y);
	}
	
	ContainsPoint_Obstacle(x, y)
	{
		return this.#obstacleCollisionShape.ContainsPoint(x, y);
	}
	
	// Check if this UnitPlatform intersects another UnitPlatform.
	// Note this is done using the obstacle collision mask instead of the full collision mask,
	// as using a reduced collision mask can help with unit queuing scenarios.
	IntersectsOther(unitPlatform)
	{
		// Testing if a unit platform intersects itself returns false.
		if (unitPlatform === this)
			return false;
		
		// Determine offset between the two unit platform positions, since the CollisionShape
		// IntersectsOther() method needs the offset.
		const [myX, myY] = this.GetPosition();
		const [otherX, otherY] = unitPlatform.GetPosition();
		
		// Use the CollisionShape IntersectsOther() method for actual intersection test.
		return this.#obstacleCollisionShape.IntersectsOther(unitPlatform.GetObstacleCollisionShape(), otherX - myX, otherY - myY);
	}
	
	// Check if this UnitPlatform intersects any other UnitPlatform.
	IntersectsAnyOther()
	{
		// Result to return from this method.
		let result = false;
		
		// Get unit's collision box as the area of interest in the collision grid.
		const [x, y] = this.GetPosition();
		const [left, top, right, bottom] = this.#obstacleCollisionShape.GetBox();
		
		// To efficiently eliminate most far-away units, use the collision grid to only
		// check units in the same collision cells as this unit. Also note that ForEachItemInArea()
		// can run its callback repeatedly with the same thing, but that doesn't matter here -
		// it only means some units may be checked more than once, but it won't affect the result.
		this.GetGameServer().GetCollisionGrid().ForEachItemInArea(
			x + left, y + top, x + right, y + bottom,
			unitPlatform =>
			{
				// Test if this unit platform intersects another unit platform in the same collision cell.
				if (this.IntersectsOther(unitPlatform))
				{
					result = true;	// return true from IntersectsAnyOther()
					return true;	// bail out and stop iterating in ForEachItemInArea()
				}
			});
		
		return result;
	}
	
	// Methods to save and restore the unit position and angle, which is useful when stepping
	// movement and detecting a collision.
	SavePosition()
	{
		const [x, y] = this.GetPosition();
		
		return {
			x,
			y,
			angle: this.GetAngle()
		};
	}
	
	RestorePosition(p)
	{
		this.SetPosition(p.x, p.y);
		this.SetAngle(p.angle);
	}
}