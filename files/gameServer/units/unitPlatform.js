
// A UnitPlatform is the bottom part of a unit, such as the driving part of a tank,
// or the platform of a static turret emplacement. It could also be referred to as the
// unit base, but that would probably be confusing with the term "base class".
export class UnitPlatform {

	// Private fields
	#unit;			// reference to Unit
	
	constructor(unit)
	{
		this.#unit = unit;
	}
	
	GetUnit()
	{
		return this.#unit;
	}
	
	Tick(dt)
	{
		// override
	}
}