
import { UnitPlatform } from "./unitPlatform.js";
import { MovableObject } from "../classes/movableObject.js";

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
	
	constructor(gameServer, x, y)
	{
		super(gameServer);
		
		this.#movable = new MovableObject(gameServer, x, y);
	}
	
	GetPosition()
	{
		return this.#movable.GetPosition();
	}
}