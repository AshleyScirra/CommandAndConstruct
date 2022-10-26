
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
	
	// Called to update the client unit state with data received from GameServer.
	UpdateState(x, y, platformAngle, turretOffsetAngle)
	{
		// Update the platform position and angle.
		this.#platform.SetPosition(x, y);
		this.#platform.SetAngle(platformAngle);
		
		// Update the turret to follow the platform.
		this.#turret.SetOffsetAngle(turretOffsetAngle);
		this.#turret.Update();
		
		// If this unit has a selection box, update that too.
		if (this.#selectionBoxInst)
		{
			this.#selectionBoxInst.x = x;
			this.#selectionBoxInst.y = y;
			this.#selectionBoxInst.angle = platformAngle;
		}
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