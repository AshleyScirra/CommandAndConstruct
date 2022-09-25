
// A UnitPlatform is the bottom part of a unit, such as the driving part of a tank,
// or the platform of a static turret emplacement. It could also be referred to as the
// unit base, but that would probably be confusing with the term "base class".
export class UnitPlatform {

	// Private fields
	#gameServer;			// reference to GameServer
	
	constructor(gameServer)
	{
		this.#gameServer = gameServer;
	}
}