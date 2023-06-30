
import { SteppedValueTimeline } from "../gameClient/net/steppedValueTimeline.js";
import { InterpolatedValueTimeline } from "../gameClient/net/interpolatedValueTimeline.js";
import * as MathUtils from "../utils/clientMathUtils.js";

// The ClientPlatform class represents the platform part of a ClientUnit,
// as a counterpart to a UnitPlatform class on GameServer.
export class ClientPlatform {
	
	// Private fields
	#unit;				// ClientUnit this platform belongs to
	#inst;				// Construct instance representing this platform
	
	// Timelines for upcoming position updates from the network, and a short history
	// of the past position for handling late updates.
	#timelinePos = new SteppedValueTimeline();
	#timelinePosHistory = new InterpolatedValueTimeline("linear");
	
	// If the client realises the position is wrong, the error is spread out over
	// time to make the correction less noticable. These are the correction still to apply.
	#xCorrection = 0;
	#yCorrection = 0;
	
	// Interpolated timelines for angle and speed.
	#timelineAngle = new InterpolatedValueTimeline("angular");
	#timelineSpeed = new SteppedValueTimeline();
	#timelineAcceleration = new SteppedValueTimeline();
	
	#speed = 0;			// current speed in px/s
	#maxSpeed = 250;	// maximum speed - TODO: sync with server-side value
	#acceleration = 0;	// current acceleration in px/s/s
	
	#moveMarkerInst;	// Construct instance representing move destination
	
	constructor(unit, x, y, angle, speed)
	{
		this.#unit = unit;
		
		// For now this is hard-coded to create a TankPlatform instance.
		const runtime = this.#unit.GetRuntime();
		this.#inst = runtime.objects.TankPlatform.createInstance("UnitPlatforms", x, y);
		this.#inst.angle = angle;
		this.#speed = speed;
		
		// Add initial values to the timelines at a timestamp of 0.
		this.#timelinePos.Add(0, [x, y]);
		this.#timelineAngle.Add(0, angle);
		this.#timelineSpeed.Add(0, speed);
		this.#timelineAcceleration.Add(0, 0);
		
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
		this.ClearMoveMarker();
		
		this.#timelinePos.Release();
		this.#timelinePosHistory.Release();
		this.#timelineAngle.Release();
		this.#timelineSpeed.Release();
		this.#timelineAcceleration.Release();
		
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
	
	GetPositionWithCorrectionApplied()
	{
		// Return the current platform position but with any remaining correction already applied.
		// This returns where the client knows it ought to be as opposed to where it is shown.
		const [x, y] = this.GetPosition();
		return [x + this.#xCorrection, y + this.#yCorrection];
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
	// and selection box (and debug text if any) so they follow the platform's changes.
	#OnPositionOrAngleChanged()
	{
		this.#unit.GetTurret().Update();
		this.#unit.UpdateSelectionBox();
		this.#unit.UpdateDebugTextPosition();
	}
	
	// When receiving position, speed or angle updates from the network, insert the
	// received values in to the timelines at the given timestamp.
	OnNetworkUpdatePosition(serverTime, x, y)
	{
		// If a position update is received late (behind the current simulation time),
		// we want to still use it if possible, as position updates are fairly infrequent.
		// Look in the position history timeline to see where the client had this unit
		// at the server time, and find what the offset was at that time.
		// Note that if the unit isn't ticking, the position history won't have updated
		// and could be very old, but it doesn't matter - the unit won't have moved since
		// then if it wasn't ticking.
		if (serverTime <= this.GetGameClient().GetPingManager().GetSimulationTime())
		{
			// However if a message is so late it's older than even the last entry in
			// the position history, it can't be used, so discard it.
			if (serverTime < this.#timelinePosHistory.GetOldestTimestamp())
				return;
			
			// Get platform position at timestamp of the message and find the offset.
			const [oldX, oldY] = this.#timelinePosHistory.Get(serverTime, false /* deleteOldEntries */);
			
			// Store the offset to the position in the X/Y correction values.
			// These will apply the offset over time making the update less noticable.
			this.#xCorrection = x - oldX;
			this.#yCorrection = y - oldY;
		}
		else
		{
			// Position message is on time: add it to the timeline so it's used on schedule.
			this.#timelinePos.Add(serverTime, [x, y]);
		}
		
		// As soon as any update comes in from the network for this platform, start the
		// unit ticking again so it updates accordingly.
		this.#unit.SetTicking(true);
	}
	
	OnNetworkUpdateSpeed(serverTime, speed)
	{
		this.#timelineSpeed.Add(serverTime, speed);
		
		this.#unit.SetTicking(true);
	}
	
	OnNetworkUpdateAcceleration(serverTime, acceleration)
	{
		this.#timelineAcceleration.Add(serverTime, acceleration);
		
		this.#unit.SetTicking(true);
	}
	
	OnNetworkUpdateAngle(serverTime, angle)
	{
		this.#timelineAngle.Add(serverTime, angle);
		
		this.#unit.SetTicking(true);
	}
	
	// Called every tick to update the platform over time.
	Tick(dt, simulationTime)
	{
		// Apply acceleration and movement at the current speed.
		this.#TickMovement(dt, simulationTime);
		
		// Update the position and apply correction over time.
		this.#TickPosition(dt, simulationTime);
		
		// Clean up old entries from the timelines.
		this.#TickTimelines(simulationTime);
		
		// Return a boolean indicating if the platform still needs ticking.
		return this.#NeedsTicking(simulationTime);
	}
	
	// Apply acceleration and movement at the current speed.
	#TickMovement(dt, simulationTime)
	{
		// Acceleration changes are stepped values, as they are one-off changes
		// with no interpolation. Apply any acceleration change for this tick.
		// TODO: compensate for acceleration change lateness.
		const accEntry = this.#timelineAcceleration.GetSteppedValue(simulationTime);
		if (accEntry !== null)
		{
			this.#acceleration = accEntry.value;
		}
		
		// Adjust the speed according to the current acceleration.
		if (this.#acceleration !== 0)
		{
			this.#speed = MathUtils.Clamp(this.#speed + this.#acceleration * dt, 0, this.#maxSpeed);
		}
		
		// To minimize bandwidth, speed changes are also only sent as one-off changes,
		// such as sending a speed of 0 when stopped. If such an update is available, allow it
		// to override the speed set previously, as it reflects the true value on the server.
		// TODO: compensate for speed change lateness.
		const speedEntry = this.#timelineSpeed.GetSteppedValue(simulationTime);
		if (speedEntry !== null)
		{
			this.#speed = speedEntry.value;
		}
		
		// Set the unit angle to the current interpolated value from the angle timeline.
		this.SetAngle(this.#timelineAngle.Get(simulationTime));
		
		// If the speed is nonzero, move the unit forwards at the current speed and angle.
		if (this.#speed !== 0)
		{
			// Note the current acceleration is also applied to the move distance as it is
			// on the server.
			const moveDist = MathUtils.Clamp(this.#speed * dt + 0.5 * this.#acceleration * dt * dt,
											 0, this.#maxSpeed * dt);
			
			const angle = this.GetAngle();
			this.OffsetPosition(Math.cos(angle) * moveDist, Math.sin(angle) * moveDist);
			
			// If a move marker is showing, clear it if it's gotten close on the assumption
			// it's now arrived.
			this.#ClearMoveMarkerIfClose();
		}
	}
	
	#TickPosition(dt, simulationTime)
	{
		// Position updates arrive irregularly (every couple of seconds). This is too
		// infrequent to usefully interpolate between. Therefore position updates use a
		// "stepped" timeline, which either returns nothing, or the new value at the
		// current time. Check if a new value is available this tick.
		const posEntry = this.#timelinePos.GetSteppedValue(simulationTime);
		if (posEntry !== null)
		{
			// Get the new position.
			const [x, y] = posEntry.value;
			
			// Rather than just updating immediately to the new position, store the offset
			// in the X/Y correction values to be applied over time.
			const [curX, curY] = this.GetPosition();
			this.#xCorrection = x - curX;
			this.#yCorrection = y - curY;
		}
		
		// If the client position is wrong, the offset is stored in the X/Y correction values.
		// Apply some correction every tick, and subtract off the correction applied, so by the
		// time the correction values reach 0 the full correction has been applied.
		if (this.#xCorrection !== 0 || this.#yCorrection !== 0)
		{
			// Offset to apply
			let dx = 0;
			let dy = 0;
			
			// On each axis, the maximum correction per tick is whichever is largest of:
			// 1) 20 pixels per second (for small corrections)
			// 2) 95% of the remaining correction per second (for larger corrections)
			const maxChangeX = Math.max(20 * dt, Math.abs(this.#xCorrection * (1 - Math.pow(0.05, dt))));
			const maxChangeY = Math.max(20 * dt, Math.abs(this.#yCorrection * (1 - Math.pow(0.05, dt))));
			
			// On each axis, if the remaining correction is below the maximum allowed
			// correction this tick, then apply the full remaining correction. Otherwise
			// apply up to the maximum correction, and subtract off the correction applied.
			if (Math.abs(this.#xCorrection) <= maxChangeX)
			{
				dx = this.#xCorrection;
				this.#xCorrection = 0;
			}
			else
			{
				dx = Math.sign(this.#xCorrection) * maxChangeX;
				this.#xCorrection -= dx;
			}
			
			if (Math.abs(this.#yCorrection) <= maxChangeY)
			{
				dy = this.#yCorrection;
				this.#yCorrection = 0;
			}
			else
			{
				dy = Math.sign(this.#yCorrection) * maxChangeY;
				this.#yCorrection -= dy;
			}
			
			// Apply the correction for this tick.
			this.OffsetPosition(dx, dy);
		}
	}
	
	#TickTimelines(simulationTime)
	{
		// Add the current position of the platform on the client to the position history
		// timeline. This is used to look up past positions if a network update arrives late.
		this.#timelinePosHistory.Add(simulationTime, this.GetPosition());
		
		// Delete interpolated timeline entries older than 1 second (and 2 seconds for
		// the position history). This saves memory as old entries aren't needed any more.
		// Some old entries are kept for interpolated timelines as entries added late
		// could affect where the current interpolated position is.
		this.#timelineAngle.DeleteEntriesOlderThan(simulationTime - 1);
		this.#timelinePosHistory.DeleteEntriesOlderThan(simulationTime - 2);
	}
	
	// Return true if the platform still needs ticking. Returning false allows the unit
	// to opt-out of ticking to save client CPU time. Currently the platform needs ticking
	// if any of the following is true:
	// 1) there is any position correction still to apply
	// 2) the unit is moving (its speed is not 0)
	// 3) there is any entry in any of the timestamps ahead of the current time
	// Note that the third point is conservative - sometimes there will be an entry in the
	// timeline but it's for the same value, so there is no real change. However for static
	// units this only happens briefly when the full update arrives, but this still achieves
	// the main goal of removing the vast majority of static units from needing ticking.
	// Also note that timelines don't do forwards prediction. If they do, then platforms
	// could still need ticking even when there is no entry past the current time.
	#NeedsTicking(simulationTime)
	{
		return this.#xCorrection !== 0 ||
				this.#yCorrection !== 0 ||
				this.#speed !== 0 ||
				this.#timelinePos.GetNewestTimestamp() >= simulationTime ||
				this.#timelineSpeed.GetNewestTimestamp() >= simulationTime ||
				this.#timelineAcceleration.GetNewestTimestamp() >= simulationTime ||
				this.#timelineAngle.GetNewestTimestamp() >= simulationTime;
	}
	
	ContainsPoint(x, y)
	{
		return this.#inst.containsPoint(x, y);
	}
	
	// Create an instance of a MoveMarker at the given position, or if there's an existing
	// instance for this unit, just move it to the new position.
	ShowMoveMarker(moveX, moveY)
	{
		const runtime = this.#unit.GetRuntime();
		
		if (!this.#moveMarkerInst)
		{
			this.#moveMarkerInst = runtime.objects.MoveMarker.createInstance("Background", moveX, moveY);
		}
		
		this.#moveMarkerInst.setPosition(moveX, moveY);
	}
	
	ClearMoveMarker()
	{
		if (this.#moveMarkerInst)
		{
			this.#moveMarkerInst.destroy();
			this.#moveMarkerInst = null;
		}
	}
	
	#ClearMoveMarkerIfClose()
	{
		if (!this.#moveMarkerInst)
			return;		// no move marker showing
		
		const [myX, myY] = this.GetPosition();
		const [markerX, markerY] = this.#moveMarkerInst.getPosition();
		
		// If within 50px of the marker (using square distances to avoid square root)
		// then destroy the marker on the assumption the unit has arrived.
		if (MathUtils.DistanceSquared(myX, myY, markerX, markerY) < 50 * 50)
		{
			this.ClearMoveMarker();
		}
	}
}