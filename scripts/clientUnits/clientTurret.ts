
import { ClientUnit } from "./clientUnit.js";
import { InterpolatedValueTimeline } from "../gameClient/net/interpolatedValueTimeline.js";

// The ClientTurret class represents the turret part of a ClientUnit,
// as a counterpart to a UnitTurret class on GameServer.
export class ClientTurret {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this turret
	#offsetAngle = 0;	// The angle of the turret relative to the platform
	
	// Timeline for offset angle updates from the network.
	#timelineOffsetAngle = new InterpolatedValueTimeline("angular");
	
	constructor(unit: ClientUnit, offsetAngle: number)
	{
		this.#unit = unit;
		this.#offsetAngle = offsetAngle;
		
		// For now this is hard-coded to create a TankTurret instance.
		const runtime = this.#unit.GetRuntime();
		const [x, y] = this.#unit.GetPlatform().GetPosition();
		this.#inst = runtime.objects.TankTurret.createInstance("UnitTurrets", x, y);
		
		// Add the initial offset angle to the timeline at a timestamp of 0.
		this.#timelineOffsetAngle.Add(0, offsetAngle);
		
		// Use a tint on the instance to indicate the player: blue for player 0, and red for player 1.
		// TODO: come up with a better visualisation that can also extend to more players.
		if (this.#unit.GetPlayer() === 0)
			this.#inst.colorRgb = [0.5, 0.5, 1];
		else
			this.#inst.colorRgb = [1, 0.5, 0.5];
	}
	
	Release()
	{
		this.#timelineOffsetAngle.Release();
		
		this.#inst.destroy();
	}
	
	SetOffsetAngle(a: number)
	{
		if (this.#offsetAngle === a)
			return;		// no change
		
		this.#offsetAngle = a;
		this.Update();
	}
	
	// Update the turret's position and angle relative to the platform.
	Update()
	{
		const platform = this.#unit.GetPlatform();
		const [x, y] = platform.GetTurretPosition();
		this.#inst.setPosition(x, y);
		this.#inst.angle = platform.GetAngle() + this.#offsetAngle;
	}
	
	// When receiving angle updates from the network, insert the received value
	// into the angle timeline at the given timestamp.
	OnNetworkUpdateOffsetAngle(serverTime: number, angle: number)
	{
		this.#timelineOffsetAngle.Add(serverTime, angle);
		
		// As soon as any update comes in from the network for this platform, start the
		// unit ticking again so it updates accordingly.
		this.#unit.SetTicking(true);
	}
	
	// Called every tick to update the platform over time.
	Tick(dt: number, simulationTime: number)
	{
		// Update the turret offset angle to the current interpolated value from the
		// angle timeline.
		this.SetOffsetAngle(this.#timelineOffsetAngle.Get(simulationTime));
		
		// Delete timeline entries older than 1 second.
		this.#timelineOffsetAngle.DeleteEntriesOlderThan(simulationTime - 1);
		
		// Return a boolean indicating if the turret still needs ticking.
		return this.NeedsTicking(simulationTime);
	}
	
	// This logic works similarly to the platform, but the only requirement for ticking the
	// turret is if there is any upcoming entry in its offset angle timeline.
	NeedsTicking(simulationTime: number)
	{
		return this.#timelineOffsetAngle.GetNewestTimestamp() >= simulationTime;
	}
}