
import { SteppedValueTimeline } from "../gameClient/net/steppedValueTimeline.js";
import { InterpolatedValueTimeline } from "../gameClient/net/interpolatedValueTimeline.js";

// The ClientPlatform class represents the platform part of a ClientUnit,
// as a counterpart to a UnitPlatform class on GameServer.
export class ClientPlatform {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this platform
	
	// Timelines for position, angle and speed updates from the network.
	#timelinePos = new SteppedValueTimeline();
	#timelineAngle = new InterpolatedValueTimeline("angular");
	#timelineSpeed = new InterpolatedValueTimeline("none");
	
	// Keep another timeline which is a short history of the position.
	// This is used to correct the position with late updates.
	#timelinePosHistory = new InterpolatedValueTimeline("linear");
	
	constructor(unit, x, y)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankPlatform instance.
		const runtime = this.#unit.GetRuntime();
		this.#inst = runtime.objects.TankPlatform.createInstance("UnitPlatforms", x, y);
		
		// Add initial values to the timelines at a timestamp of 0.
		this.#timelinePos.Add(0, [x, y]);
		this.#timelineAngle.Add(0, 0);
		this.#timelineSpeed.Add(0, 0);
		
		this.#timelinePosHistory.Add(0, [x, y]);
		
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
	
	GetUnit()
	{
		return this.#unit;
	}
	
	GetGameClient()
	{
		return this.GetUnit().GetGameClient();
	}
	
	// Position, size, angle and collisions use the corresponding Construct instance.
	GetPosition()
	{
		return this.#inst.getPosition();
	}
	
	SetPosition(x, y)
	{
		const [curX, curY] = this.GetPosition();
		if (curX === x && curY === y)
			return;		// no change
		
		this.#inst.setPosition(x, y);
		this.#OnPositionOrAngleChanged();
	}
	
	OffsetPosition(dx, dy)
	{
		if (dx === 0 && dy === 0)
			return;		// no change
		
		this.#inst.offsetPosition(dx, dy);
		this.#OnPositionOrAngleChanged();
	}
	
	// The platform's image point locates where the turret is placed.
	GetTurretPosition()
	{
		return this.#inst.getImagePoint(1);
	}
	
	GetSize()
	{
		return this.#inst.getSize();
	}
	
	GetAngle()
	{
		return this.#inst.angle;
	}
	
	SetAngle(a)
	{
		if (this.#inst.angle === a)
			return;		// no change
		
		this.#inst.angle = a;
		this.#OnPositionOrAngleChanged();
	}
	
	// Whenever the unit platform position or angle changes, update the turret
	// and selection box so they follow the platform's changes.
	#OnPositionOrAngleChanged()
	{
		this.#unit.GetTurret().Update();
		this.#unit.UpdateSelectionBox();
	}
	
	// When receiving position, speed or angle updates from the network, insert the
	// received values in to the timelines at the given timestamp.
	OnNetworkUpdatePosition(serverTime, x, y)
	{
		// If a position update is received late (behind the current simulation time),
		// we want to still use it if possible, as position updates are fairly infrequent.
		// Look in the position history timeline to see where the client had this unit
		// at the server time, and find what the offset was at that time. Then that offset
		// can be applied to the unit now.
		if (serverTime <= this.GetGameClient().GetPingManager().GetSimulationTime())
		{
			// However if a message is so late it's older than even the last entry in
			// the position history, it can't be used, so discard it.
			if (serverTime < this.#timelinePosHistory.GetOldestTimestamp())
				return;
			
			// Get platform position at timestamp of the message, and apply offset.
			const [oldX, oldY] = this.#timelinePosHistory.Get(serverTime, false /* deleteOldEntries */);
			this.OffsetPosition(x - oldX, y - oldY);
		}
		else
		{
			// Position message is on time: add it to the timeline so it's used on schedule.
			this.#timelinePos.Add(serverTime, [x, y]);
		}
	}
	
	OnNetworkUpdateSpeed(serverTime, speed)
	{
		this.#timelineSpeed.Add(serverTime, speed);
	}
	
	OnNetworkUpdateAngle(serverTime, angle)
	{
		this.#timelineAngle.Add(serverTime, angle);
	}
	
	// Called every tick to update the platform over time.
	Tick(dt, simulationTime)
	{
		// The amount to move defaults to dt, but could be different if a position update
		// is used this tick.
		let movementDt = dt;
		
		// Position updates arrive irregularly (every couple of seconds). This is too
		// infrequent to usefully interpolate between. Therefore position updates use a
		// "stepped" timeline, which either returns nothing, or the new value at the
		// current time. Check if a new value is available this tick.
		const posEntry = this.#timelinePos.GetSteppedValue(simulationTime);
		if (posEntry !== null)
		{
			// Set the platform position to the new position.
			const [x, y] = posEntry.value;
			this.SetPosition(x, y);
			
			// The position has a timestamp that may be a little in the past, as client
			// ticks won't line up perfectly with server ticks. In order to improve the
			// accuracy of the movement, adjust dt to be the time since this position
			// update, so the platform moves to where it should be by now on the server.
			movementDt = simulationTime - posEntry.timestamp;
		}
		
		// Set the unit angle to the current interpolated value from the angle timeline.
		this.SetAngle(this.#timelineAngle.Get(simulationTime));
		
		// Get the current speed.
		// TODO: at the moment there is no acceleration so speeds just change instantly
		// between 0 and the maximum speed. Therefore the speed timeline currently does
		// not use any interpolation, but it likely will in future.
		const speed = this.#timelineSpeed.Get(simulationTime);
		
		// If the speed is nonzero, move the unit forwards at the current speed and angle.
		// Note that this uses 'movementDt', which may be the time since the position
		// update if this tick updated the position.
		if (speed !== 0)
		{
			const moveDist = speed * movementDt;
			const angle = this.GetAngle();
			this.OffsetPosition(Math.cos(angle) * moveDist, Math.sin(angle) * moveDist);
		}
		
		// Add the current position of the platform on the client to the position history
		// timeline. This is used to look up past positions if a network update arrives late.
		this.#timelinePosHistory.Add(simulationTime, this.GetPosition());
		
		// Delete interpolated timeline entries older than 1 second (and 2 seconds for
		// the position history). This saves memory as old entries aren't needed any more.
		// Some old entries are kept for interpolated timelines as entries added late
		// could affect where the current interpolated position is.
		this.#timelineAngle.DeleteEntriesOlderThan(simulationTime - 1);
		this.#timelineSpeed.DeleteEntriesOlderThan(simulationTime - 1);
		this.#timelinePosHistory.DeleteEntriesOlderThan(simulationTime - 2);
	}
	
	ContainsPoint(x, y)
	{
		return this.#inst.containsPoint(x, y);
	}
}