
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
	#didUpdateState = false;	// true for one tick after updating from network
	
	constructor(gameClient, id, player)
	{
		this.#gameClient = gameClient;
		this.#id = id;
		this.#player = player;
	}
	
	// Create a single client unit for the "create-initial-state" message
	static CreateFromInitialData(gameClient, unitData)
	{
		const id = unitData["id"];
		const player = unitData["player"];
		const x = unitData["x"];
		const y = unitData["y"];
		
		const unit = new ClientUnit(gameClient, id, player);
		unit.#platform = new ClientPlatform(unit, x, y);
		unit.#turret = new ClientTurret(unit);
		return unit;
	}
	
	Release()
	{
		// Set unselected so any selection box is also destroyed and it's removed
		// from SelectionManager's list of selected units
		this.#gameClient.GetSelectionManager().SetSelected(this, false);
		
		// Destroy turret and platform
		this.#turret.Release();
		this.#platform.Release();
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
	
	// Called to update the client unit state with data received from GameServer.
	UpdateState(x, y, speed, platformAngle, turretOffsetAngle)
	{
		// Update the platform position and angle.
		this.#platform.SetPosition(x, y);
		this.#platform.SetSpeed(speed);
		this.#platform.SetAngle(platformAngle);
		
		// Update the turret to follow the platform.
		this.#turret.SetOffsetAngle(turretOffsetAngle);
		this.#turret.Update();
		
		// If this unit has a selection box, update that too.
		this.UpdateSelectionBox();
		
		// Flag unit as having updated state. This means it's already up-to-date so the next tick
		// shouldn't try to advance it any further.
		this.#didUpdateState = true;
	}
	
	Tick(dt)
	{
		// If the unit received state from the network this tick, then it should already be up-to-date.
		// So in that case skip ticking it since that might move it further forwards than it is meant to be this tick.
		// It will only tick it to move it forwards if no updates are available from the network.
		if (this.#didUpdateState)
		{
			this.#didUpdateState = false;
			return;
		}
		
		this.#platform.Tick(dt);
	}
	
	// Update the selection box position and angle to match the unit platform.
	UpdateSelectionBox()
	{
		if (!this.#selectionBoxInst)
			return;		// no selection box
		
		const [x, y] = this.#platform.GetPosition();
		const angle = this.#platform.GetAngle();
		
		this.#selectionBoxInst.x = x;
		this.#selectionBoxInst.y = y;
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
			this.#selectionBoxInst.width = w + 8;
			this.#selectionBoxInst.height = h + 8;
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