
import { ClientPlatform } from "./clientPlatform.js";
import { ClientTurret } from "./clientTurret.js";

// If a unit is not updated by the server for this long, it will be destroyed on the
// assumption something got out of sync. This is currently set to 7 seconds as the
// server sends full updates every 2 seconds, and so this time means the unit likely
// missed 3 opportunities in a row for a full update.
const CLIENT_UNIT_TIMEOUT = 7;

// The ClientUnit class represents a unit in GameClient.
// Its main job is to synchronise state to match what is happening on GameServer,
// which holds the real Unit class that represents the authoritative state of the game.
export class ClientUnit {

	// Private fields
	#gameClient;				// reference to GameClient unit belongs to
	#id = -1;					// unique ID of this unit
	#player = 0;				// player this unit belongs to
	#platform;					// ClientPlatform for this unit's platform
	#turret;					// ClientTurret for this unit's turret
	#selectionBoxInst;			// Construct instance representing selection box
	#lastUpdateTime = 0;		// last time received any update from server
	
	constructor(gameClient, id, player)
	{
		this.#gameClient = gameClient;
		this.#id = id;
		this.#player = player;
		
		// Add GameClient state for this unit
		this.#gameClient.UnitWasCreated(this);
	}
	
	// Create a client unit with initial state specified in 'info' object
	static Create(gameClient, info)
	{
		const unit = new ClientUnit(gameClient, info.id, info.player);
		unit.#platform = new ClientPlatform(unit, info.x, info.y, info.platformAngle, info.speed);
		unit.#turret = new ClientTurret(unit, info.turretOffsetAngle);
		unit.#turret.Update();
		return unit;
	}
	
	Release()
	{
		// Clean up GameClient state for this unit
		this.#gameClient.UnitWasDestroyed(this);
		
		// Destroy turret and platform
		this.#turret.Release();
		this.#platform.Release();
	}
	
	GetGameClient()
	{
		return this.#gameClient;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetId()
	{
		return this.#id;
	}
	
	GetPlayer()
	{
		return this.#player;
	}
	
	GetPlatform()
	{
		return this.#platform;
	}
	
	GetTurret()
	{
		return this.#turret;
	}
	
	// Called when any update about this unit is received over the network.
	SetLastUpdateTime(serverTime)
	{
		this.#lastUpdateTime = Math.max(this.#lastUpdateTime, serverTime);
	}
	
	// Check if the unit has timed out, which is when it last got any update
	// longer than CLIENT_UNIT_TIMEOUT ago from the current time.
	IsTimedOut(simulationTime)
	{
		return this.#lastUpdateTime < simulationTime - CLIENT_UNIT_TIMEOUT;
	}
	
	// Set whether this unit will have Tick() called every tick.
	SetTicking(shouldTick)
	{
		this.#gameClient.SetUnitTicking(this, shouldTick);
	}
	
	// Called every tick (if the unit is opted in to ticking).
	Tick(dt, simulationTime)
	{
		// Tick the platform and turret. Both return a boolean indicating if they
		// still need ticking.
		const keepTickingPlatform = this.#platform.Tick(dt, simulationTime);
		const keepTickingTurret = this.#turret.Tick(dt, simulationTime);
		
		// If neither the platform nor turret needs ticking any more,
		// opt out of ticking to save CPU time.
		if (!keepTickingPlatform && !keepTickingTurret)
		{
			this.SetTicking(false);
		}
	}
	
	// Update the selection box position and angle to match the unit platform.
	UpdateSelectionBox()
	{
		if (!this.#selectionBoxInst)
			return;		// no selection box
		
		const [x, y] = this.#platform.GetPosition();
		const angle = this.#platform.GetAngle();
		
		this.#selectionBoxInst.setPosition(x, y);
		this.#selectionBoxInst.angle = angle;
	}
	
	// Use the unit platform for collision checks.
	ContainsPoint(x, y)
	{
		return this.#platform.ContainsPoint(x, y);
	}
	
	SetSelectedState(isSelected)
	{
		if (isSelected)		// marking selected
		{
			if (this.#selectionBoxInst)
				return;		// already created selection box
			
			// Create a UnitSelectionBox instance, which is a 9-patch object,
			// to represent the selected state of this unit. Make the selection
			// box match the position and angle of the unit platform, and size
			// it a little larger so the green border is visible around it.
			const runtime = this.GetRuntime();
			const [x, y] = this.#platform.GetPosition();
			const [w, h] = this.#platform.GetSize();
			const angle = this.#platform.GetAngle();

			this.#selectionBoxInst = runtime.objects.UnitSelectionBox.createInstance("SelectionBoxes", x, y);
			this.#selectionBoxInst.setSize(w + 8, h + 8);
			this.#selectionBoxInst.angle = angle;
		}
		else				// marking not selected
		{
			// Remove the selection box instance if any
			if (!this.#selectionBoxInst)
				return;		// already don't have selection box
			
			this.#selectionBoxInst.destroy();
			this.#selectionBoxInst = null;
		}
	}
}