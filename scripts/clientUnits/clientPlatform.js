
// The ClientPlatform class represents the platform part of a ClientUnit,
// as a counterpart to a UnitPlatform class on GameServer.
export class ClientPlatform {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this platform
	
	constructor(unit, x, y)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankPlatform instance.
		const runtime = this.#unit.GetRuntime();
		this.#inst = runtime.objects.TankPlatform.createInstance(0 /* layer */, x, y);
	}
}