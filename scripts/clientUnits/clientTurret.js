
// The ClientTurret class represents the turret part of a ClientUnit,
// as a counterpart to a UnitTurret class on GameServer.
export class ClientTurret {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this turret
	#offsetAngle = 0;	// The angle of the turret relative to the platform
	
	constructor(unit)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankTurret instance.
		const runtime = this.#unit.GetRuntime();
		const [x, y] = this.#unit.GetPlatform().GetPosition();
		this.#inst = runtime.objects.TankTurret.createInstance("UnitTurrets", x, y);
		
		// Use a tint on the instance to indicate the player: blue for player 0, and red for player 1.
		// TODO: come up with a better visualisation that can also extend to more players.
		if (this.#unit.GetPlayer() === 0)
			this.#inst.colorRgb = [0.5, 0.5, 1];
		else
			this.#inst.colorRgb = [1, 0.5, 0.5];
	}
	
	Release()
	{
		this.#inst.destroy();
	}
	
	SetOffsetAngle(a)
	{
		this.#offsetAngle = a;
	}
	
	// Update the turret's position and angle relative to the platform.
	Update()
	{
		const platform = this.#unit.GetPlatform();
		const [x, y] = platform.GetTurretPosition();
		this.#inst.x = x;
		this.#inst.y = y;
		this.#inst.angle = platform.GetAngle() + this.#offsetAngle;
	}
}