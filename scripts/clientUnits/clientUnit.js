
import { ClientPlatform } from "./clientPlatform.js";
import { ClientTurret } from "./clientTurret.js";

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
	
	constructor(gameClient, id, player)
	{
		this.#gameClient = gameClient;
		this.#id = id;
		this.#player = player;
		
		// Add GameClient state for this unit
		this.#gameClient.UnitCreated(this);
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
		this.#gameClient.UnitDestroyed(this);
		
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